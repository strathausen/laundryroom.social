import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { db as Database } from "@laundryroom/db/client";
import { and, asc, eq } from "@laundryroom/db";
import {
  Attendee,
  GroupMember,
  Meetup,
  Pledge,
  PledgeBoard,
  PledgeFulfillment,
  UpsertPledgeBoardSchema,
} from "@laundryroom/db/schema";

import { createTRPCRouter, protectedProcedure } from "../trpc";

type Db = typeof Database;
type GroupMemberRole = (typeof GroupMember.$inferSelect)["role"];

const ADMIN_ROLES: GroupMemberRole[] = ["admin", "owner"];

/**
 * Role of `userId` in the group that owns `meetupId`, or null when the user
 * is not a member of that group. Throws NOT_FOUND when the meetup doesn't exist.
 */
async function memberRoleForMeetup(
  db: Db,
  meetupId: string,
  userId: string,
): Promise<GroupMemberRole | null> {
  const meetup = await db.query.Meetup.findFirst({
    where: eq(Meetup.id, meetupId),
    columns: { id: true },
    with: {
      group: {
        columns: { id: true },
        with: {
          members: {
            where: eq(GroupMember.userId, userId),
            columns: { role: true },
          },
        },
      },
    },
  });
  if (!meetup) {
    throw new TRPCError({ code: "NOT_FOUND", message: "meetup not found" });
  }
  return meetup.group.members[0]?.role ?? null;
}

/**
 * Role of `userId` in the group that owns `pledgeBoardId`, walking
 * PledgeBoard → Meetup → Group → GroupMember. Returns null when the user is
 * not a member of that group. Throws NOT_FOUND when the board doesn't exist.
 */
async function memberRoleForBoard(
  db: Db,
  pledgeBoardId: string,
  userId: string,
): Promise<GroupMemberRole | null> {
  const pledgeBoard = await db.query.PledgeBoard.findFirst({
    where: eq(PledgeBoard.id, pledgeBoardId),
    columns: { meetupId: true },
  });
  if (!pledgeBoard) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "pledge board not found",
    });
  }
  return memberRoleForMeetup(db, pledgeBoard.meetupId, userId);
}

/** Throws FORBIDDEN unless the role is admin or owner of the group. */
function assertAdmin(role: GroupMemberRole | null) {
  if (role === null || !ADMIN_ROLES.includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "only group admins can manage the pledge board",
    });
  }
}

const QuantitySchema = z.number().int().min(0).max(999);

export const pledgeboardRouter = createTRPCRouter({
  upsertPledgeBoard: protectedProcedure
    .input(UpsertPledgeBoardSchema)
    .mutation(async function ({ ctx, input }) {
      const userId = ctx.session.user.id;
      const { meetupId } = input;
      const data = { title: input.title, description: input.description };
      assertAdmin(await memberRoleForMeetup(ctx.db, meetupId, userId));
      return ctx.db.transaction(async (db) => {
        const existingPledgeBoard = await db.query.PledgeBoard.findFirst({
          where: eq(PledgeBoard.meetupId, meetupId),
          columns: { id: true },
        });
        if (existingPledgeBoard) {
          await db
            .update(PledgeBoard)
            .set(data)
            .where(eq(PledgeBoard.id, existingPledgeBoard.id));
          return { id: existingPledgeBoard.id };
        }
        const [created] = await db
          .insert(PledgeBoard)
          .values({ ...data, meetupId, createdBy: userId })
          .returning({ id: PledgeBoard.id });
        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "could not create the pledge board",
          });
        }
        return created;
      });
    }),

  deletePledgeBoard: protectedProcedure
    .input(z.string().uuid())
    .mutation(async function ({ ctx, input }) {
      assertAdmin(await memberRoleForBoard(ctx.db, input, ctx.session.user.id));
      await ctx.db.delete(PledgeBoard).where(eq(PledgeBoard.id, input));
      return {};
    }),

  getPledgeBoard: protectedProcedure
    .input(z.object({ meetupId: z.string().uuid() }))
    .query(async function ({ ctx, input }) {
      // only (non-banned) members of the group get to see the board and who pledged what
      const role = await memberRoleForMeetup(
        ctx.db,
        input.meetupId,
        ctx.session.user.id,
      );
      if (role === null || role === "banned") {
        return null;
      }
      const pledgeBoard = await ctx.db.query.PledgeBoard.findFirst({
        where: eq(PledgeBoard.meetupId, input.meetupId),
        columns: {
          id: true,
          title: true,
          description: true,
          meetupId: true,
        },
        with: {
          pledges: {
            columns: {
              id: true,
              title: true,
              description: true,
              capacity: true,
            },
            orderBy: asc(Pledge.sortOrder),
            with: {
              fulfillments: {
                columns: { quantity: true },
                with: {
                  user: { columns: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
      return pledgeBoard ?? null;
    }),

  upsertPledge: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        pledgeBoardId: z.string().uuid(),
        title: z.string().max(255),
        description: z.string(),
        sortOrder: z.number().int().min(0),
        capacity: QuantitySchema,
      }),
    )
    .mutation(async function ({ ctx, input }) {
      const userId = ctx.session.user.id;
      const { id, pledgeBoardId, ...data } = input;
      // only admins / owners of the group may add or edit pledge items
      assertAdmin(await memberRoleForBoard(ctx.db, pledgeBoardId, userId));
      if (!id) {
        const [created] = await ctx.db
          .insert(Pledge)
          .values({ ...data, pledgeBoardId })
          .returning({ id: Pledge.id });
        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "could not create the pledge",
          });
        }
        return created;
      }
      const [updated] = await ctx.db
        .update(Pledge)
        .set(data)
        .where(
          // make sure the pledge actually belongs to the pledge board we checked
          and(eq(Pledge.id, id), eq(Pledge.pledgeBoardId, pledgeBoardId)),
        )
        .returning({ id: Pledge.id });
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "pledge not found" });
      }
      return updated;
    }),

  deletePledge: protectedProcedure
    .input(z.string().uuid())
    .mutation(async function ({ ctx, input }) {
      const pledge = await ctx.db.query.Pledge.findFirst({
        where: eq(Pledge.id, input),
        columns: { id: true, pledgeBoardId: true },
      });
      if (!pledge) {
        throw new TRPCError({ code: "NOT_FOUND", message: "pledge not found" });
      }
      assertAdmin(
        await memberRoleForBoard(
          ctx.db,
          pledge.pledgeBoardId,
          ctx.session.user.id,
        ),
      );
      await ctx.db.delete(Pledge).where(eq(Pledge.id, input));
      return {};
    }),

  setFulfillment: protectedProcedure
    .input(z.object({ pledgeId: z.string().uuid(), quantity: QuantitySchema }))
    .mutation(async function ({ ctx, input }) {
      // if the user has a pledge fulfillment, update it
      // if it is zero, delete it
      // if it is non-zero, create it
      const userId = ctx.session.user.id;
      const pledge = await ctx.db.query.Pledge.findFirst({
        where: eq(Pledge.id, input.pledgeId),
        columns: { id: true },
        with: {
          pledgeBoard: {
            columns: { id: true },
            with: {
              meetup: {
                columns: {
                  id: true,
                  status: true,
                  startTime: true,
                  duration: true,
                },
                with: {
                  group: {
                    columns: { id: true },
                    with: {
                      members: {
                        where: eq(GroupMember.userId, userId),
                        columns: { role: true },
                      },
                    },
                  },
                  attendees: {
                    where: and(
                      eq(Attendee.userId, userId),
                      eq(Attendee.status, "going"),
                    ),
                    columns: { userId: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!pledge) {
        throw new TRPCError({ code: "NOT_FOUND", message: "pledge not found" });
      }
      const { meetup } = pledge.pledgeBoard;
      // banning leaves the attendee rows in place, so a "going" rsvp alone is
      // not enough: the user must also (still) be a non-banned group member
      const role = meetup.group.members[0]?.role ?? null;
      if (role === null || role === "banned") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "only group members can pledge",
        });
      }
      // only people who rsvp'd "going" to the meetup can pledge
      if (!meetup.attendees.length) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: 'rsvp "going" to the meetup before pledging',
        });
      }
      // mirrors meetup.rsvp: no changes once the meetup is cancelled or over
      const isOver =
        new Date() >
        new Date(meetup.startTime.getTime() + meetup.duration * 60 * 1000);
      if (meetup.status === "cancelled" || isOver) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            meetup.status === "cancelled"
              ? "this meetup has been cancelled"
              : "this meetup is over",
        });
      }
      if (input.quantity === 0) {
        await ctx.db
          .delete(PledgeFulfillment)
          .where(
            and(
              eq(PledgeFulfillment.pledgeId, input.pledgeId),
              eq(PledgeFulfillment.userId, userId),
            ),
          );
        return {};
      }
      // one atomic upsert on the (pledgeId, userId) unique index, so two
      // concurrent first pledges (double click, second tab) can't race a
      // find-then-insert into a unique violation
      await ctx.db
        .insert(PledgeFulfillment)
        .values({ pledgeId: input.pledgeId, userId, quantity: input.quantity })
        .onConflictDoUpdate({
          target: [PledgeFulfillment.pledgeId, PledgeFulfillment.userId],
          set: { quantity: input.quantity },
        });
      return {};
    }),

  reorderPledges: protectedProcedure
    .input(
      z.object({
        pledgeBoardId: z.string().uuid(),
        sorting: z.array(z.string().uuid()),
      }),
    )
    .mutation(async function ({ ctx, input }) {
      assertAdmin(
        await memberRoleForBoard(
          ctx.db,
          input.pledgeBoardId,
          ctx.session.user.id,
        ),
      );
      await ctx.db.transaction(async (db) => {
        for (const [i, pledgeId] of input.sorting.entries()) {
          await db
            .update(Pledge)
            .set({ sortOrder: i + 1 })
            .where(
              // ids that belong to another board are simply ignored
              and(
                eq(Pledge.id, pledgeId),
                eq(Pledge.pledgeBoardId, input.pledgeBoardId),
              ),
            );
        }
      });
      return {};
    }),
});
