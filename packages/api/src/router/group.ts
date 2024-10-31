import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, gt, ilike, not, sql } from "@laundryroom/db";
import { Group, GroupMember, User } from "@laundryroom/db/schema";
import { classify } from "@laundryroom/llm";

import { protectedProcedure, publicProcedure } from "../trpc";

export const groupRouter = {
  search: publicProcedure
    .input(z.object({ query: z.string().optional() }))
    .query(({ ctx, input }) => {
      if (!input.query || input.query.length < 3) {
        return ctx.db
          .select({
            id: Group.id,
            name: Group.name,
            description: Group.description,
            image: Group.image,
            createdAt: Group.createdAt,
            membersCount: sql`(
              select count(*) from ${GroupMember} where ${GroupMember.groupId} = ${Group.id}
              and ${GroupMember.role} != 'banned'
            )`.mapWith(Number),
          })
          .from(Group)
          .where((_t) =>
            and(eq(Group.moderationStatus, "ok"), eq(Group.status, "active")),
          )
          .orderBy((t) => desc(t.createdAt))
          .limit(10);
      }
      const matchQuery = sql`(
        setweight(to_tsvector('english', ${Group.name}), 'A') ||
        setweight(to_tsvector('english', ${Group.description}), 'B') ||
        setweight(to_tsvector('english', ${Group.aiSearchText}), 'C')
      ), websearch_to_tsquery('english', ${input.query})`;
      const similarityQuery = sql`(
        similarity(${Group.name}, ${input.query}) +
        similarity(${Group.description}, ${input.query}) + 
        similarity(${Group.aiSearchText}, ${input.query})
      )`;
      return ctx.db
        .select({
          id: Group.id,
          name: Group.name,
          description: Group.description,
          image: Group.image,
          createdAt: Group.createdAt,
          rank: sql`ts_rank_cd(${matchQuery})`,
          similarity: similarityQuery,
          membersCount: sql`(
            select count(*) from ${GroupMember} where ${GroupMember.groupId} = ${Group.id}
            and ${GroupMember.role} != 'banned'
          )`.mapWith(Number),
        })
        .from(Group)
        .where((t) =>
          and(
            gt(t.similarity, 0.1),
            eq(Group.moderationStatus, "ok"),
            eq(Group.status, "active"),
          ),
        )
        .orderBy((t) => desc(t.similarity))
        .limit(10);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.session?.user;
      const groupQuery = ctx.db.query.Group.findFirst({
        where: eq(Group.id, input.id),
        with: {
          members: {
            limit: 10,
            orderBy: desc(GroupMember.joinedAt),
            with: { user: { columns: { name: true, id: true } } },
          },
        },
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
      const [group, membership] = await Promise.all([
        groupQuery,
        membershipQuery,
      ]);
      return { group, membership };
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        description: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        // also check for user permissions, only group admins or owners can update
        const membership = await ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, input.id),
            eq(GroupMember.userId, ctx.session.user.id),
          ),
          with: { user: { columns: { good_person: true } } },
        });
        if (!membership || !["owner", "admin"].includes(membership.role)) {
          throw new Error("not authorized");
        }
        const classification = await classify(input.description);
        const data = { ...input, ...classification };
        return ctx.db.update(Group).set(data).where(eq(Group.id, input.id));
      }
      const classification = await classify(input.description);
      const data = { ...input, ...classification };
      return ctx.db.transaction(async (tx) => {
        const [group] = await tx
          .insert(Group)
          .values(data)
          .returning({ id: Group.id });
        if (!group) {
          throw new Error("failed to create group");
        }
        await tx.insert(GroupMember).values({
          groupId: group.id,
          userId: ctx.session.user.id,
          role: "owner",
        });
        return group;
      });
    }),

  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      // check if the current user is the owner
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      if (membership?.role !== "owner") {
        throw new Error("not authorized");
      }
      return ctx.db.delete(Group).where(eq(Group.id, input));
    }),

  join: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.insert(GroupMember).values({
        groupId: input.groupId,
        userId: ctx.session.user.id,
        role: "member",
      });
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
      // check if the current user is an admin or owner
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input.groupId),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      if (!["owner", "admin"].includes(membership?.role ?? "")) {
        throw new Error("not authorized");
      }
      // user to remove should not be the owner
      if (membership?.userId === input.userId) {
        throw new Error("cannot remove owner");
      }
      return ctx.db
        .delete(GroupMember)
        .where(
          and(
            eq(GroupMember.groupId, input.groupId),
            eq(GroupMember.userId, input.userId),
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
      // check if the current user is an admin or owner
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input.groupId),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      if (!["owner", "admin"].includes(membership?.role ?? "")) {
        throw new Error("not authorized");
      }
      return ctx.db
        .update(Group)
        .set({ status: input.status })
        .where(eq(Group.id, input.groupId));
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
      // check if the current user is an admin or owner
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input.groupId),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      if (!["owner", "admin"].includes(membership?.role ?? "")) {
        throw new Error("not authorized");
      }
      return ctx.db
        .update(GroupMember)
        .set({ role: input.role })
        .where(
          and(
            eq(GroupMember.groupId, input.groupId),
            eq(GroupMember.userId, input.userId),
          ),
        );
    }),
} satisfies TRPCRouterRecord;
