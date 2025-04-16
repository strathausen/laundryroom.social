import { z } from "zod";

import { createEventUpdate } from "@laundryroom/calendar";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  lt,
  not,
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
      const user = ctx.session?.user;
      const groupQuery = user
        ? ctx.db.query.Group.findFirst({
            where: inArray(
              Group.id,
              sql`(SELECT group_id FROM meetup WHERE id = ${input.id})`,
            ),
            with: {
              members: {
                where: and(
                  eq(GroupMember.userId, user.id),
                  not(eq(GroupMember.role, "banned")),
                ),
                with: {
                  user: {
                    columns: { id: true, email: true, name: true },
                  },
                },
              },
            },
          })
        : undefined;
      const meetupQuery = ctx.db.query.Meetup.findFirst({
        where: eq(Meetup.id, input.id),
        columns: {
          id: true,
          groupId: true,
          title: true,
          description: true,
          startTime: true,
          duration: true,
          location: true,
          createdAt: true,
          updatedAt: true,
          status: true,
          attendeeLimit: true,
        },
        with: {
          group: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
          // this might get slow for some meetups in the future, but we can optimize later
          attendees: {
            where: eq(Attendee.status, "going"),
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
          organizer: {
            columns: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      });
      const [group, meetup] = await Promise.all([groupQuery, meetupQuery]);
      if (!meetup) {
        throw new Error("Meetup not found");
      }
      if (!group && user) {
        throw new Error("Group not found");
      }
      const isSuperUser = !!group?.members.some(
        (m) => m.user.id === user?.id && ["admin", "owner"].includes(m.role),
      );
      const isGroupMember = !!group && group.members.length > 0; // we are only interested in the length
      return {
        ...meetup,
        isOngoing:
          meetup.startTime < new Date() &&
          new Date() <
            new Date(meetup.startTime.getTime() + meetup.duration * 60 * 1000),
        isOver:
          new Date() >
          new Date(meetup.startTime.getTime() + meetup.duration * 60 * 1000),
        attendees: meetup.attendees.map((a) => ({
          ...a,
          isCurrentUser: a.user.id === user?.id,
        })),
        isSuperUser,
        isGroupMember,
        isLoggedIn: !!user,
      };
    }),

  // with cursor: load meetups from the past
  // without cursor: load all of the upcoming meetups
  byGroupId: publicProcedure
    .input(
      z.object({
        groupId: z.string(),
        cursor: z.string().nullish(),
        limit: z.number().max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const user = ctx.session?.user;
      const { limit, groupId, cursor } = input;
      const direction = cursor ? "backward" : "forward";

      // check if user is member of the group
      const membershipQuery = user
        ? ctx.db.query.GroupMember.findFirst({
            where: and(
              eq(GroupMember.groupId, groupId),
              eq(GroupMember.userId, user.id),
            ),
          })
        : undefined;

      // TODO FIXME over time, this query will become slow
      // (O(n) with number of past attended meetups per group)
      const attendancesQuery = user
        ? ctx.db.query.Attendee.findMany({
            where: and(
              eq(Attendee.userId, user.id),
              inArray(
                Attendee.meetupId,
                sql`(SELECT id FROM meetup WHERE group_id = ${groupId})`,
              ),
            ),
          })
        : [];
      // only show past meetups, paginated, omit hidden meetups for non-admins
      const meetupsQuery = ctx.db.query.Meetup.findMany({
        where: and(
          eq(Meetup.groupId, input.groupId),
          direction === "forward"
            ? gt(Meetup.startTime, cursor ? new Date(cursor) : new Date())
            : lt(Meetup.startTime, cursor ? new Date(cursor) : new Date()),
        ),
        orderBy:
          direction === "forward"
            ? asc(Meetup.startTime)
            : desc(Meetup.startTime),
        limit: limit + 1,
      });

      const attendeesCountQuery = ctx.db
        .select({
          count: count(Attendee.meetupId),
          meetupId: Attendee.meetupId,
        })
        .from(Attendee)
        .where(
          inArray(
            Attendee.meetupId,
            sql`(SELECT id FROM meetup WHERE group_id = ${groupId})`,
          ),
        )
        .groupBy(Attendee.meetupId);

      const [attendances, meetups, attendeesCount, membership] =
        await Promise.all([
          attendancesQuery,
          meetupsQuery,
          attendeesCountQuery,
          membershipQuery,
        ]);
      const hasMore = meetups.length > limit;
      if (hasMore) {
        meetups.pop();
      }
      // if we have more than the limit, we have a next/prev page depending on the direction
      const nextCursor =
        hasMore && direction === "backward"
          ? meetups[meetups.length - 1]?.startTime.toISOString()
          : direction === "forward"
            ? meetups[0]?.startTime.toISOString()
            : null;

      // reverse the order if backward
      if (direction === "backward") {
        meetups.reverse();
      }
      const isSuperUser = ["admin", "owner", "moderator"].includes(
        membership?.role ?? "",
      );
      // combine meetups with the user's attendance status
      return {
        meetups: meetups
          // omit hidden meetups for non-admins
          .filter((meetup) => isSuperUser || meetup.status !== "hidden")
          .map((meetup) => ({
            ...meetup,
            isOngoing:
              meetup.startTime < new Date() &&
              new Date() <
                new Date(
                  meetup.startTime.getTime() + meetup.duration * 60 * 1000,
                ),
            isOver:
              new Date() >
              new Date(
                meetup.startTime.getTime() + meetup.duration * 60 * 1000,
              ),
            attendance: attendances.find((a) => a.meetupId === meetup.id),
            attendeesCount:
              attendeesCount.find((a) => a.meetupId === meetup.id)?.count ?? 0,
          })),
        nextCursor,
      };
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
      // maybe
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

  myAttendance: publicProcedure
    .input(z.object({ meetupId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.session) {
        return null;
      }
      const { user } = ctx.session;
      const meetup = await ctx.db.query.Meetup.findFirst({
        where: eq(Meetup.id, input.meetupId),
      });
      if (!meetup) {
        throw new Error("Meetup not found");
      }
      const attendee = await ctx.db.query.Attendee.findFirst({
        where: and(
          eq(Attendee.meetupId, meetup.id),
          eq(Attendee.userId, user.id),
        ),
      });
      return attendee?.status;
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
            where: not(eq(GroupMember.role, "banned")),
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
      let meetupId: string;
      let members: {
        user: { email: string; id: string; name: string | null };
      }[] = group.members;
      if (input.id) {
        // check if group is the same, you cannot move meetups between groups
        const meetup = await ctx.db.query.Meetup.findFirst({
          where: eq(Meetup.id, input.id),
          with: {
            attendees: {
              where: eq(Attendee.status, "going"),
              with: {
                user: {
                  columns: { id: true, email: true, name: true },
                },
              },
            },
          },
        });
        if (!meetup) {
          throw new Error("Meetup not found");
        }
        if (meetup.groupId !== input.groupId) {
          throw new Error("Group mismatch");
        }
        if (data.status !== "hidden") {
          members = [];
        } else {
          members = meetup.attendees;
        }
        await ctx.db.update(Meetup).set(data).where(eq(Meetup.id, input.id));
        meetupId = input.id;
      } else {
        const res = await ctx.db
          .insert(Meetup)
          .values({ ...data, organizerId: user.id })
          .returning({
            id: Meetup.id,
          });
        if (!res[0]) {
          throw new Error("Failed to create meetup");
        }
        meetupId = res[0]?.id;
      }
      const icsInvite = createEventUpdate({
        uuid: meetupId,
        title: data.title,
        description: data.description ?? "",
        start: data.startTime,
        duration: data.duration ?? 60,
        status: data.status === "active" ? "CONFIRMED" : "CANCELLED",
        // TODO: use URL from config
        url: `https://laundryroom.social/meetup/${meetupId}`,
        location: data.location ?? "",
      });

      for (const member of members) {
        if (member.user.id === user.id || !meetupId) {
          continue;
        }
        await sendEmail(
          member.user.email,
          "eventUpdate",
          {
            isNew: !data.id,
            meetup: { ...data, id: meetupId },
            group,
          },
          [
            {
              filename: "invite.ics",
              content: icsInvite.value,
              contentType: "text/calendar",
            },
          ],
        );
      }
      return { id: meetupId };
    }),
});
