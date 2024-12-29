import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, gt, ilike, not, sql } from "@laundryroom/db";
import {
  Group,
  GroupMember,
  GroupPromotion,
  Meetup,
  User,
} from "@laundryroom/db/schema";
import { sendEmail } from "@laundryroom/email";
import { classify } from "@laundryroom/llm";

import { protectedProcedure, publicProcedure } from "../trpc";

export const groupRouter = {
  search: publicProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(({ ctx, input }) => {
      const { query } = input;
      const baseSelect = {
        id: Group.id,
        name: Group.name,
        description: sql`left(${Group.description}, 100)`.mapWith(String),
        image: Group.image,
        createdAt: Group.createdAt,
        status: Group.status,
        membersCount: sql`(
          SELECT COUNT(*) FROM ${GroupMember}
          WHERE ${GroupMember.groupId} = ${Group.id}
          AND ${GroupMember.role} != 'banned'
        )`.mapWith(Number),
        nextMeetupDate: sql`(
          SELECT ${Meetup.startTime} FROM ${Meetup}
          WHERE ${Meetup.groupId} = "group".id
          AND ${Meetup.startTime} > NOW()
          ORDER BY ${Meetup.startTime} ASC LIMIT 1
        )`.mapWith(String),
      };

      if (!query || query.length < 3) {
        return ctx.db
          .select(baseSelect)
          .from(Group)
          .where(
            and(eq(Group.moderationStatus, "ok"), eq(Group.status, "active")),
          )
          .orderBy(desc(Group.createdAt))
          .limit(10);
      }

      const matchQuery = sql`(
        setweight(to_tsvector('english', ${Group.name}), 'A') ||
        setweight(to_tsvector('english', ${Group.description}), 'B') ||
        setweight(to_tsvector('english', ${Group.aiSearchText}), 'C')
      ), websearch_to_tsquery('english', ${query})`;

      const similarityQuery = sql`(
        similarity(${Group.name}, ${query}) +
        similarity(${Group.description}, ${query}) + 
        similarity(${Group.aiSearchText}, ${query})
      )`;

      return ctx.db
        .select({
          ...baseSelect,
          description: Group.description,
          rank: sql`ts_rank_cd(${matchQuery})`,
          similarity: similarityQuery,
        })
        .from(Group)
        .where(
          and(
            gt(similarityQuery, 0.1),
            eq(Group.moderationStatus, "ok"),
            eq(Group.status, "active"),
          ),
        )
        .orderBy(desc(similarityQuery))
        .limit(10);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.session?.user;
      const groupQuery = ctx.db.query.Group.findFirst({
        columns: {
          id: true,
          name: true,
          description: true,
          image: true,
          status: true,
        },
        where: eq(Group.id, input.id),
        with: {
          members: {
            limit: 10,
            orderBy: desc(GroupMember.joinedAt),
            with: { user: { columns: { name: true, id: true } } },
          },
        },
      });
      const promotionQuery = ctx.db.query.GroupPromotion.findFirst({
        columns: { id: true },
        where: and(
          eq(GroupPromotion.groupId, input.id),
          eq(GroupPromotion.promotionStatus, "promotable"),
        ),
      });
      const membershipQuery = user
        ? ctx.db.query.GroupMember.findFirst({
            where: and(
              eq(GroupMember.groupId, input.id),
              eq(GroupMember.userId, user.id),
              not(eq(GroupMember.role, "banned")),
            ),
          })
        : null;
      const [group, membership, promotion] = await Promise.all([
        groupQuery,
        membershipQuery,
        promotionQuery,
      ]);
      return { group, membership, promotion };
    }),

  myGroups: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    return ctx.db
      .select({
        id: Group.id,
        name: Group.name,
        description: Group.description,
        image: Group.image,
        createdAt: Group.createdAt,
        status: Group.status,
        membersCount: sql`(
          SELECT COUNT(*) FROM ${GroupMember}
          WHERE ${GroupMember.groupId} = ${Group.id}
          AND ${GroupMember.role} != 'banned'
        )`.mapWith(Number),
        nextMeetupDate: sql`(
          SELECT ${Meetup.startTime} FROM ${Meetup}
          WHERE ${Meetup.groupId} = ${Group.id}
          AND ${Meetup.startTime} > NOW()
          ORDER BY ${Meetup.startTime} ASC LIMIT 1
        )`.mapWith(String),
      })
      .from(Group)
      .innerJoin(GroupMember, eq(GroupMember.groupId, Group.id))
      .where(
        and(
          eq(GroupMember.userId, userId),
          not(eq(GroupMember.role, "banned")),
        ),
      )
      .orderBy(desc(Group.createdAt));
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        description: z.string(),
        image: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx.session;
      const userId = user.id;

      const classifyAndUpdate = async (data: typeof input) => {
        const classification = await classify(data.description);
        return { ...data, ...classification };
      };

      if (input.id) {
        const membership = await ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, input.id),
            eq(GroupMember.userId, userId),
          ),
        });

        if (!membership || !["owner", "admin"].includes(membership.role)) {
          throw new Error("Not authorized");
        }

        const data = await classifyAndUpdate(input);
        return ctx.db.update(Group).set(data).where(eq(Group.id, input.id));
      }

      const data = await classifyAndUpdate(input);

      return ctx.db.transaction(async (tx) => {
        const [group] = await tx
          .insert(Group)
          .values(data)
          .returning({ id: Group.id });

        if (!group) throw new Error("Failed to create group");

        await tx.insert(GroupMember).values({
          groupId: group.id,
          userId,
          role: "owner",
        });

        return group;
      });
    }),

  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: groupId }) => {
      const userId = ctx.session.user.id;

      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, groupId),
          eq(GroupMember.userId, userId),
        ),
      });

      if (membership?.role !== "owner") {
        throw new Error("Not authorized");
      }

      return ctx.db.delete(Group).where(eq(Group.id, groupId));
    }),

  join: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { groupId } = input;

      await ctx.db.insert(GroupMember).values({
        groupId,
        userId,
        role: "member",
      });

      const ownerMembership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, groupId),
          eq(GroupMember.role, "owner"),
        ),
        with: {
          user: { columns: { id: true, email: true, name: true } },
          group: { columns: { id: true, name: true } },
        },
      });

      // Ideally this should not happen, we need to find a way to handle this
      if (!ownerMembership) throw new Error("Group has no owner");

      await sendEmail(ownerMembership.user.email, "newMember", {
        member: ctx.session.user,
        group: ownerMembership.group,
        user: ownerMembership.user,
      });

      return { success: true };
    }),

  leave: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(GroupMember)
        .where(
          and(
            eq(GroupMember.groupId, input.groupId),
            eq(GroupMember.userId, ctx.session.user.id),
          ),
        );
    }),

  removeMember: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { groupId, userId: targetUserId } = input;

      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, groupId),
          eq(GroupMember.userId, userId),
        ),
      });

      if (!["owner", "admin"].includes(membership?.role ?? "")) {
        throw new Error("Not authorized");
      }

      if (membership?.userId === targetUserId) {
        throw new Error("Cannot remove owner");
      }

      return ctx.db
        .delete(GroupMember)
        .where(
          and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, targetUserId),
          ),
        );
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        status: z.enum(["active", "archived", "hidden"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { groupId, status } = input;

      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, groupId),
          eq(GroupMember.userId, userId),
        ),
      });

      if (!["owner", "admin"].includes(membership?.role ?? "")) {
        throw new Error("Not authorized");
      }

      return ctx.db.update(Group).set({ status }).where(eq(Group.id, groupId));
    }),

  members: protectedProcedure
    .input(z.object({ groupId: z.string(), search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { groupId, search } = input;
      // check if the user searching is also a member
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, groupId),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      if (!membership) {
        throw new Error("not authorized");
      }
      // return nothing for banned members
      if (membership.role === "banned") {
        return { members: [], count: 0, role: "member" };
      }
      const members = await ctx.db
        .select({
          userId: User.id,
          userName: User.name,
          role: GroupMember.role,
        })
        .from(GroupMember)
        .innerJoin(User, eq(GroupMember.userId, User.id))
        .where(
          search
            ? and(
                eq(GroupMember.groupId, groupId),
                ilike(User.name, `%${search}%`),
              )
            : eq(GroupMember.groupId, groupId),
        )
        .limit(10);

      const membersCount = await ctx.db
        .select({
          count: sql`count(*)`,
        })
        .from(GroupMember)
        .where(eq(GroupMember.groupId, groupId));

      //  if the user is not an admin or owner, replace the role with "member"
      if (!["owner", "admin"].includes(membership.role)) {
        // for non-admins, filter out banned members
        members
          .filter((member) => member.role !== "banned")
          .forEach((member) => {
            member.role = "member";
          });
      }

      return { members, count: membersCount[0]?.count, role: membership.role };
    }),

  changeRole: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        userId: z.string(),
        role: z.enum(["admin", "moderator", "member", "banned"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { groupId, userId: targetUserId, role } = input;

      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, groupId),
          eq(GroupMember.userId, userId),
        ),
      });

      if (!["owner", "admin"].includes(membership?.role ?? "")) {
        throw new Error("Not authorized");
      }

      return ctx.db
        .update(GroupMember)
        .set({ role })
        .where(
          and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, targetUserId),
          ),
        );
    }),
} satisfies TRPCRouterRecord;
