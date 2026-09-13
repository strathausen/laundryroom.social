import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  not,
  sql,
} from "@laundryroom/db";
import {
  Attendee,
  Group,
  GroupMember,
  GroupPromotion,
  GroupShortCode,
  Meetup,
  User,
} from "@laundryroom/db/schema";
import { sendEmail } from "@laundryroom/email";
import { classify } from "@laundryroom/llm";

import { protectedProcedure, publicProcedure } from "../trpc";

type ModerationStatus = NonNullable<typeof Group.$inferSelect.moderationStatus>;
/** statuses assigned by moderation that an edit must not reset */
const manualModerationStatuses: ModerationStatus[] = [
  "rejected",
  "review",
  "reported",
];

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
          AND ${Meetup.status} = 'active'
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

  byShortCode: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ ctx, input }) => {
      const shortCode = await ctx.db.query.GroupShortCode.findFirst({
        where: eq(GroupShortCode.code, input.code),
        with: {
          group: {
            columns: {
              id: true,
            },
          },
        },
      });

      if (!shortCode) {
        throw new Error("Group not found");
      }

      return { groupId: shortCode.group.id };
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
          timeZone: true,
          location: true,
        },
        where: eq(Group.id, input.id),
        with: {
          members: {
            limit: 10,
            orderBy: desc(GroupMember.joinedAt),
            with: { user: { columns: { name: true, id: true } } },
          },
          shortCodes: {
            limit: 1,
            columns: { code: true },
            orderBy: desc(GroupShortCode.createdAt),
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

  myGroups: publicProcedure.query(async ({ ctx }) => {
    const userId = ctx.session?.user.id;
    if (!userId) {
      return [];
    }

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
        timeZone: z.string().default("UTC"),
        location: z.string().optional(),
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
          with: {
            group: {
              with: {
                shortCodes: {
                  limit: 1,
                  orderBy: desc(GroupShortCode.createdAt),
                },
              },
            },
          },
        });

        if (!membership || !["owner", "admin"].includes(membership.role)) {
          throw new Error("Not authorized");
        }

        // a manual moderation decision (or a pending review) must not be
        // clobbered by re-classifying on every edit; keep the stored status.
        // note: the short-code backfill below needs a classification run, so
        // groups in one of these statuses are not backfilled here
        if (
          membership.group.moderationStatus &&
          manualModerationStatuses.includes(membership.group.moderationStatus)
        ) {
          return ctx.db.update(Group).set(input).where(eq(Group.id, input.id));
        }

        const data = await classifyAndUpdate(input);
        // if the group has no short code, create one, only for old groups, could be removed in the future
        if (!membership.group.shortCodes.length) {
          await ctx.db.insert(GroupShortCode).values({
            groupId: membership.group.id,
            code: data.shortCode,
          });
        }
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

        // Try to insert the short code, if it exists, append -1, -2, etc.
        let shortCode = data.shortCode;
        let counter = 1;
        while (true) {
          try {
            await tx.insert(GroupShortCode).values({
              groupId: group.id,
              code: shortCode,
            });
            break;
          } catch (err) {
            // If the error is not a unique constraint violation, rethrow
            if (
              !(err instanceof Error) ||
              !err.message.includes("unique constraint")
            ) {
              throw err;
            }
            // Try again with an incremented number
            shortCode = `${data.shortCode}-${counter}`;
            counter++;
          }
        }

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

      const group = await ctx.db.query.Group.findFirst({
        columns: { id: true, status: true },
        where: eq(Group.id, groupId),
      });
      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND", message: "group not found" });
      }
      if (group.status === "archived") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "this group is archived",
        });
      }

      const existingMembership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, groupId),
          eq(GroupMember.userId, userId),
        ),
      });
      // already a member: nothing to do. this also covers banned users, who
      // must keep their ban row - and must not learn that they are banned
      if (existingMembership) {
        return { success: true };
      }

      // two concurrent joins (double-click, two tabs) can both pass the check
      // above; the second must not fail on the (group_id, user_id) primary key
      await ctx.db
        .insert(GroupMember)
        .values({
          groupId,
          userId,
          role: "member",
        })
        .onConflictDoNothing({
          target: [GroupMember.groupId, GroupMember.userId],
        });

      // the membership row is written at this point; a notification failure
      // must not fail the join
      try {
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
        if (!ownerMembership) {
          console.error(
            `group ${groupId} has no owner, skipping new member notification`,
          );
        } else {
          await sendEmail(ownerMembership.user.email, "newMember", {
            member: ctx.session.user,
            group: ownerMembership.group,
            user: ownerMembership.user,
          });
        }
      } catch (err) {
        console.error("failed to send new member notification", err);
      }

      return { success: true };
    }),

  leave: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { groupId } = input;

      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, groupId),
          eq(GroupMember.userId, userId),
        ),
      });
      // not a member: nothing to do. banned users must keep their ban row,
      // otherwise they could leave and re-join
      if (!membership || membership.role === "banned") {
        return;
      }
      if (membership.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "transfer ownership before leaving",
        });
      }

      const futureMeetupsOfGroup = await ctx.db.query.Meetup.findMany({
        columns: { id: true },
        where: and(
          eq(Meetup.groupId, groupId),
          gt(Meetup.startTime, new Date()),
        ),
      });
      const removeMembership = ctx.db
        .delete(GroupMember)
        .where(
          and(eq(GroupMember.groupId, groupId), eq(GroupMember.userId, userId)),
        );
      const removeFutureMeetupAttendances = ctx.db.delete(Attendee).where(
        and(
          eq(Attendee.userId, userId),
          inArray(
            Attendee.meetupId,
            futureMeetupsOfGroup.map((m) => m.id),
          ),
        ),
      );
      await Promise.all([removeMembership, removeFutureMeetupAttendances]);
    }),

  removeMember: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { groupId, userId: targetUserId } = input;

      const [membership, target] = await Promise.all([
        ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, userId),
          ),
        }),
        ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, targetUserId),
          ),
        }),
      ]);

      if (!membership || !["owner", "admin"].includes(membership.role)) {
        throw new Error("Not authorized");
      }
      if (targetUserId === userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "you cannot remove yourself, leave the group instead",
        });
      }
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "member not found" });
      }
      if (target.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "cannot remove owner",
        });
      }
      // admins must not remove each other, only the owner can
      if (membership.role === "admin" && target.role === "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "only the owner can remove an admin",
        });
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
        status: z.enum(["active", "archived", "hidden", "nsfw", "private"]),
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
        return {
          members: [],
          count: 0,
          role: "member",
          userId: membership.userId,
        };
      }
      const isAdmin = ["owner", "admin"].includes(membership.role);

      const [members, membersCount] = await Promise.all([
        ctx.db
          .select({
            userId: User.id,
            userName: User.name,
            role: GroupMember.role,
          })
          .from(GroupMember)
          .innerJoin(User, eq(GroupMember.userId, User.id))
          .where(
            and(
              eq(GroupMember.groupId, groupId),
              // only admins get to see banned members
              isAdmin ? undefined : not(eq(GroupMember.role, "banned")),
              search ? ilike(User.name, `%${search}%`) : undefined,
            ),
          )
          .limit(10),
        ctx.db
          .select({ count: count() })
          .from(GroupMember)
          .where(
            and(
              eq(GroupMember.groupId, groupId),
              not(eq(GroupMember.role, "banned")),
            ),
          ),
      ]);

      return {
        // non-admins don't get to see roles, everyone is just a "member"
        members: isAdmin
          ? members
          : members.map((member) => ({ ...member, role: "member" as const })),
        count: membersCount[0]?.count ?? 0,
        role: membership.role,
        // the viewer's own id, so the client can mirror the role-change rules
        userId: membership.userId,
      };
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

      const [membership, target] = await Promise.all([
        ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, userId),
          ),
        }),
        ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, targetUserId),
          ),
        }),
      ]);

      if (!membership || !["owner", "admin"].includes(membership.role)) {
        throw new Error("Not authorized");
      }
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "member not found" });
      }
      // the owner's role only changes via transferOwnership
      if (target.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "cannot change the owner's role",
        });
      }
      // an admin may step down, but a self-ban cannot be undone by themselves
      if (targetUserId === userId && role === "banned") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "you cannot ban yourself",
        });
      }
      // admins must not demote (or ban) each other, only the owner can;
      // an admin may still step down themselves
      if (
        membership.role === "admin" &&
        target.role === "admin" &&
        targetUserId !== userId
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "only the owner can change another admin's role",
        });
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

  transferOwnership: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { groupId, userId: targetUserId } = input;

      if (targetUserId === userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "you already own this group",
        });
      }

      const [membership, target] = await Promise.all([
        ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, userId),
          ),
        }),
        ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, targetUserId),
          ),
        }),
      ]);

      if (membership?.role !== "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "only the owner can transfer ownership",
        });
      }
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "member not found" });
      }
      if (target.role === "banned") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "cannot transfer ownership to a banned user",
        });
      }

      // the checks above ran outside the transaction, so re-verify inside it:
      // the target may have left (or been removed / banned) and a concurrent
      // transfer may already have demoted the caller. both updates are
      // conditional and a throw rolls the whole transaction back, so the group
      // never ends up with zero or two owners
      await ctx.db.transaction(async (tx) => {
        const [promoted] = await tx
          .update(GroupMember)
          .set({ role: "owner" })
          .where(
            and(
              eq(GroupMember.groupId, groupId),
              eq(GroupMember.userId, targetUserId),
              not(eq(GroupMember.role, "banned")),
            ),
          )
          .returning({ userId: GroupMember.userId });
        if (!promoted) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "member not found",
          });
        }
        const [demoted] = await tx
          .update(GroupMember)
          .set({ role: "admin" })
          .where(
            and(
              eq(GroupMember.groupId, groupId),
              eq(GroupMember.userId, userId),
              eq(GroupMember.role, "owner"),
            ),
          )
          .returning({ userId: GroupMember.userId });
        if (!demoted) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "only the owner can transfer ownership",
          });
        }
      });

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
