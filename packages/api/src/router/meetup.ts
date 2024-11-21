import { z } from "zod";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  lt,
  sql,
} from "@laundryroom/db";
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
    .input(
      z.object({
        groupId: z.string(),
        cursor: z.string().nullish(),
        limit: z.number().max(50).default(10),
        direction: z.enum(["forward", "backward"]).default("backward"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const user = ctx.session?.user;
      // TODO over time, this query will become slow
      // (O(n) with number of past attended meetups per group)
      const attendancesQuery = user
        ? ctx.db.query.Attendee.findMany({
            where: and(
              eq(Attendee.userId, user.id),
              inArray(
                Attendee.meetupId,
                sql`(SELECT id FROM meetup WHERE group_id = ${input.groupId})`,
              ),
            ),
          })
        : [];
      // only show past meetups, paginated
      const meetupsQuery = ctx.db.query.Meetup.findMany({
        where: and(
          eq(Meetup.groupId, input.groupId),
          input.direction === "forward"
            ? gt(
                Meetup.startTime,
                input.cursor ? new Date(input.cursor) : new Date(),
              )
            : lt(
                Meetup.startTime,
                input.cursor ? new Date(input.cursor) : new Date(),
              ),
        ),
        orderBy:
          input.direction === "forward"
            ? asc(Meetup.startTime)
            : desc(Meetup.startTime),
        limit: 3,
      });
      // TODO if there is no cursor, it means we have an initial query
      // -> try to find hasNextPage or hasPreviousPage in the opposite direction

      const attendeesCountQuery = ctx.db
        .select({
          count: count(Attendee.meetupId),
          meetupId: Attendee.meetupId,
        })
        .from(Attendee)
        .where(
          inArray(
            Attendee.meetupId,
            sql`(SELECT id FROM meetup WHERE group_id = ${input.groupId})`,
          ),
        )
        .groupBy(Attendee.meetupId);

      const [attendances, meetups, attendeesCount] = await Promise.all([
        attendancesQuery,
        meetupsQuery,
        attendeesCountQuery,
      ]);
      // combine meetups with attendance status
      return meetups.map((meetup) => ({
        ...meetup,
        attendance: attendances.find((a) => a.meetupId === meetup.id),
        attendeesCount:
          attendeesCount.find((a) => a.meetupId === meetup.id)?.count ?? 0,
      }));
    }),

  rsvp: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["going", "not_going"]) }))
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx.session;
      const meetup = await ctx.db.query.Meetup.findFirst({
        where: eq(Meetup.id, input.id),
      });
      if (!meetup) {
        throw new Error("Meetup not found");
      }
      // check if user is member of the group
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, meetup.groupId),
          eq(GroupMember.userId, user.id),
        ),
      });
      if (!membership) {
        throw new Error("Not authorized");
      }
      // banned users cannot RSVP, but don't leak that they are banned
      if (membership.role === "banned") {
        return input.status;
      }
      const attendee = await ctx.db.query.Attendee.findFirst({
        where: and(
          eq(Attendee.meetupId, meetup.id),
          eq(Attendee.userId, user.id),
        ),
      });
      if (attendee) {
        await ctx.db
          .update(Attendee)
          .set({ status: input.status })
          .where(
            and(eq(Attendee.meetupId, meetup.id), eq(Attendee.userId, user.id)),
          );
        return input.status;
      }
      await ctx.db.insert(Attendee).values({
        meetupId: meetup.id,
        userId: user.id,
        status: input.status,
      });
      return input.status;
    }),

  upsert: protectedProcedure
    .input(UpsertMeetupSchema)
    .mutation(async ({ ctx, input }) => {
      const data = {
        ...input,
        id: input.id ?? undefined,
        startTime: input.startTime,
        // endTime: input.endTime ? new Date(input.endTime) : undefined,
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
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        throw new Error("Not authorized");
      }
      // if (input.endTime && data.startTime > new Date(input.endTime)) {
      //   throw new Error("Start time must be before end time");
      // }

      // Some additional checks when updating a meetup
      let meetupId: string | undefined;
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
        await ctx.db.update(Meetup).set(data).where(eq(Meetup.id, input.id));
        meetupId = input.id;
      } else {
        const res = await ctx.db.insert(Meetup).values(data).returning({
          id: Meetup.id,
        });
        meetupId = res[0]?.id;
      }

      for (const member of group.members) {
        if (member.user.id === user.id || !meetupId) {
          continue;
        }
        await sendEmail(member.user.email, "newEvent", {
          isNew: !data.id,
          meetup: { ...data, id: meetupId },
          group,
        });
      }
      return { id: meetupId };
    }),
});
