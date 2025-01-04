import { z } from "zod";

import { and, asc, eq } from "@laundryroom/db";
import {
  GroupMember,
  Meetup,
  Pledge,
  PledgeBoard,
  PledgeFulfillment,
  UpsertPledgeBoardSchema,
  User,
} from "@laundryroom/db/schema";

import { createTRPCRouter, protectedProcedure } from "../trpc";

export const pledgeboardRouter = createTRPCRouter({
  upsertPledgeBoard: protectedProcedure
    .input(UpsertPledgeBoardSchema)
    .mutation(async function ({ ctx, input }) {
      const userId = ctx.session.user.id;
      const { meetupId, ...data } = input;
      const meetup = await ctx.db.query.Meetup.findFirst({
        where: eq(Meetup.id, meetupId),
        with: {
          group: {
            with: { members: { where: eq(GroupMember.userId, userId) } },
          },
        },
      });
      if (!meetup) {
        throw new Error("Meetup not found");
      }
      // check user is admin / owner of the group
      const isAdmin = meetup.group.members.some(
        (member) =>
          member.userId === userId && ["admin", "owner"].includes(member.role),
      );
      if (!isAdmin) {
        throw new Error("Unauthorized");
      }
      await ctx.db.transaction(async (db) => {
        const existingPledgeBoard = await db.query.PledgeBoard.findFirst({
          where: eq(PledgeBoard.meetupId, meetupId),
        });
        if (existingPledgeBoard) {
          await db
            .update(PledgeBoard)
            .set(data)
            .where(eq(PledgeBoard.id, existingPledgeBoard.id));
          return { id: existingPledgeBoard.id };
        }
        return db
          .insert(PledgeBoard)
          .values({ ...data, meetupId })
          .returning({ id: PledgeBoard.id });
      });
    }),

  deletePledgeBoard: protectedProcedure
    .input(z.string())
    .mutation(async function ({ ctx, input }) {
      const userId = ctx.session.user.id;
      const pledgeBoard = await ctx.db.query.PledgeBoard.findFirst({
        where: eq(PledgeBoard.id, input),
        with: {
          meetup: {
            with: {
              group: { with: { members: { where: eq(User.id, userId) } } },
            },
          },
        },
      });
      if (!pledgeBoard) {
        throw new Error("PledgeBoard not found");
      }
      // check user is admin / owner of the group
      const isAdmin = pledgeBoard.meetup.group.members.some(
        (member) =>
          member.userId === userId && ["admin", "owner"].includes(member.role),
      );
      if (!isAdmin) {
        throw new Error("Unauthorized");
      }
      await ctx.db.delete(PledgeBoard).where(eq(PledgeBoard.id, input));
      return {};
    }),

  getPledgeBoard: protectedProcedure
    .input(z.object({ meetupId: z.string() }))
    .query(async function ({ ctx, input }) {
      // TODO check membership of the user in the group
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
                  user: { columns: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
      });
      return pledgeBoard;
    }),

  upsertPledge: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        pledgeBoardId: z.string(),
        title: z.string(),
        description: z.string(),
        sortOrder: z.number(),
        capacity: z.number(),
      }),
    )
    .mutation(async function ({ ctx, input }) {
      const userId = ctx.session.user.id;
      const { id, ...data } = input;

      const pledgeBoard = await ctx.db.query.PledgeBoard.findFirst({
        where: eq(PledgeBoard.id, input.pledgeBoardId),
        with: {
          meetup: {
            with: {
              group: {
                with: { members: { where: eq(GroupMember.userId, userId) } },
              },
            },
          },
        },
      });
      if (!pledgeBoard) {
        throw new Error("Pledge not found");
      }
      if (!id) {
        return ctx.db.insert(Pledge).values(input).returning({ id: Pledge.id });
      }
      // check user is admin / owner of the group that this pledge board belongs to
      const isAdmin = pledgeBoard.meetup.group.members.some(
        (member) =>
          member.userId === userId && ["admin", "owner"].includes(member.role),
      );
      if (!isAdmin) {
        throw new Error("Unauthorized");
      }
      await ctx.db
        .update(Pledge)
        .set(data)
        .where(
          // just to make sure the pledge actually belongs to the pledge board that we checked for
          and(eq(Pledge.id, id), eq(Pledge.pledgeBoardId, pledgeBoard.id)),
        );
      return {};
    }),

  setFulfillment: protectedProcedure
    .input(z.object({ pledgeId: z.string(), quantity: z.number() }))
    .mutation(async function ({ ctx, input }) {
      // if the user has a pledge fulfillment, update it
      // if it is zero, delete it
      // if it is non-zero, create it
      const userId = ctx.session.user.id;
      const pledge = await ctx.db.query.Pledge.findFirst({
        where: eq(Pledge.id, input.pledgeId),
        with: {
          pledgeBoard: {
            with: {
              meetup: {
                with: {
                  attendees: { where: eq(User.id, userId) },
                },
              },
            },
          },
        },
      });
      if (!pledge) {
        throw new Error("Pledge not found");
      }
      // check user is in the meetup
      if (!pledge.pledgeBoard.meetup.attendees.length) {
        throw new Error("Unauthorized");
      }
      const fulfillment = await ctx.db.query.PledgeFulfillment.findFirst({
        where: eq(PledgeFulfillment.pledgeId, input.pledgeId),
      });
      if (input.quantity === 0) {
        if (fulfillment) {
          await ctx.db
            .delete(PledgeFulfillment)
            .where(eq(PledgeFulfillment.id, fulfillment.id));
        }
      } else {
        if (fulfillment) {
          await ctx.db
            .update(PledgeFulfillment)
            .set(input)
            .where(eq(PledgeFulfillment.id, fulfillment.id));
        } else {
          await ctx.db.insert(PledgeFulfillment).values({
            pledgeId: input.pledgeId,
            userId,
            quantity: input.quantity,
          });
        }
      }
      return {};
    }),

  reorderPledges: protectedProcedure
    .input(z.object({ sorting: z.array(z.string()) }))
    .mutation(async function ({ ctx, input }) {
      // const userId = ctx.session.user.id;
      // TODO check if admin of the group
      // TODO check if the pledge board belongs to the meetup
      // TODO make sure the pledges belong to the pledge board
      await Promise.all(
        input.sorting.map((pledgeId, i) => {
          return ctx.db
            .update(Pledge)
            .set({ sortOrder: i + 1 })
            .where(eq(Pledge.id, pledgeId));
        }),
      );
      return {};
    }),
});
