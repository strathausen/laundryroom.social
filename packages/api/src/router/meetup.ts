import { z } from "zod";

import { and, eq } from "@laundryroom/db";
import {
  Attendee,
  Group,
  GroupMember,
  Meetup,
  UpsertMeetupSchema,
} from "@laundryroom/db/schema";
import { sendEmail } from "@laundryroom/email";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

export const meetupRouter = createTRPCRouter({
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.Meetup.findFirst({
        where: eq(Meetup.id, input.id),
      });
    }),

  byGroupId: publicProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.Meetup.findMany({
        where: eq(Meetup.groupId, input.groupId),
      });
    }),

  rsvp: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["going", "not_going"]) }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.session?.user;
      if (!user) {
        throw new Error("Not authenticated");
      }
      const meetup = await ctx.db.query.Meetup.findFirst({
        where: eq(Meetup.id, input.id),
      });
      if (!meetup) {
        throw new Error("Meetup not found");
      }
      await ctx.db.insert(Attendee).values({
        meetupId: meetup.id,
        userId: user.id,
        status: input.status,
      });
      return meetup;
    }),

  upsert: protectedProcedure
    .input(UpsertMeetupSchema)
    .mutation(async ({ ctx, input }) => {
      const data = {
        ...input,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
      };
      const { user } = ctx.session;
      // check if user is admin or owner of the group
      const group = await ctx.db.query.Group.findFirst({
        where: eq(Group.id, input.groupId),
        with: {
          members: {
            with: {
              user: {
                columns: { id: true, email: true, name: true },
              },
            },
          },
        },
      });
      if (!group) {
        throw new Error("Group not found");
      }
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, group.id),
          eq(GroupMember.userId, user.id),
        ),
      });
      if (!membership || !["owner", "admin"].includes(membership.role!)) {
        throw new Error("Not authorized");
      }
      if (input.endTime && data.startTime > new Date(input.endTime)) {
        throw new Error("Start time must be before end time");
      }
      // update existing meetup if id is provided
      if (input.id) {
        // check if group is the same, you cannot move meetups between groups
        const meetup = await ctx.db.query.Meetup.findFirst({
          where: eq(Meetup.id, input.id),
        });
        if (!meetup) {
          throw new Error("Meetup not found");
        }
        if (meetup.groupId !== input.groupId) {
          throw new Error("Group mismatch");
        }
        // all seems good, update the meetup
        return ctx.db.update(Meetup).set(data).where(eq(Meetup.id, input.id));
      }

      const meetup = await ctx.db.insert(Meetup).values(data).returning({
        id: Meetup.id,
      });
      for (const member of group.members) {
        if (member.user.id === user.id) {
          continue;
        }
        await sendEmail(member.user.email, "newEvent", {
          eventId: meetup[0]?.id!,
          eventName: data.title,
        });
      }
      return meetup;
    }),
});
