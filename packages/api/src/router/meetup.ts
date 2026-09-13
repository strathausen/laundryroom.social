import { TRPCError } from "@trpc/server";
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
      // attendees are already filtered to status "going"
      const goingCount = meetup.attendees.length;
      return {
        ...meetup,
        isOngoing:
          meetup.startTime < new Date() &&
          new Date() <
            new Date(meetup.startTime.getTime() + meetup.duration * 60 * 1000),
        isOver:
          new Date() >
          new Date(meetup.startTime.getTime() + meetup.duration * 60 * 1000),
        isFull:
          meetup.attendeeLimit != null && goingCount >= meetup.attendeeLimit,
        attendees: meetup.attendees.map((a) => ({
          ...a,
          isCurrentUser: a.user.id === user?.id,
        })),
        isSuperUser,
        isGroupMember,
        isLoggedIn: !!user,
      };
    }),

  // with cursor: load meetups from the past (before the cursor)
  // without cursor: load the upcoming meetups
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
      const now = new Date();
      const boundary = cursor ? new Date(cursor) : now;

      // check if user is member of the group
      const membership = user
        ? await ctx.db.query.GroupMember.findFirst({
            where: and(
              eq(GroupMember.groupId, groupId),
              eq(GroupMember.userId, user.id),
            ),
          })
        : undefined;
      const isSuperUser = ["admin", "owner", "moderator"].includes(
        membership?.role ?? "",
      );
      // omit hidden meetups for non-admins
      const visibilityFilter = isSuperUser
        ? undefined
        : not(eq(Meetup.status, "hidden"));

      // forward: upcoming meetups, oldest first; backward: past meetups, newest first
      const meetupsQuery = ctx.db.query.Meetup.findMany({
        where: and(
          eq(Meetup.groupId, groupId),
          visibilityFilter,
          direction === "forward"
            ? gt(Meetup.startTime, boundary)
            : lt(Meetup.startTime, boundary),
        ),
        orderBy:
          direction === "forward"
            ? asc(Meetup.startTime)
            : desc(Meetup.startTime),
        limit: limit + 1,
      });

      // on the first (forward) page, find out whether there are past meetups
      // to load. this must apply the same visibility filter as the page, or a
      // group whose only past meetups are hidden would offer non-admins a
      // "load past meetups" button that loads an empty page
      const pastMeetupQuery =
        direction === "forward"
          ? ctx.db.query.Meetup.findFirst({
              where: and(
                eq(Meetup.groupId, groupId),
                visibilityFilter,
                lt(Meetup.startTime, now),
              ),
              columns: { id: true },
            })
          : undefined;

      const [meetups, pastMeetup] = await Promise.all([
        meetupsQuery,
        pastMeetupQuery,
      ]);
      const hasMore = meetups.length > limit;
      if (hasMore) {
        meetups.pop();
      }
      // backward: continue before the oldest meetup of this page (if there are more)
      // forward: the next page is the past, starting from now. the cursor is
      // single-direction, so upcoming meetups beyond `limit` are not paginated
      // (the client requests the cap of 50, which is plenty for now)
      const nextCursor =
        direction === "backward"
          ? hasMore
            ? (meetups[meetups.length - 1]?.startTime.toISOString() ?? null)
            : null
          : pastMeetup
            ? now.toISOString()
            : null;

      // reverse the order if backward
      if (direction === "backward") {
        meetups.reverse();
      }
      const meetupIds = meetups.map((meetup) => meetup.id);

      // only look up attendance for the meetups on this page
      const attendancesQuery =
        user && meetupIds.length
          ? ctx.db.query.Attendee.findMany({
              where: and(
                eq(Attendee.userId, user.id),
                inArray(Attendee.meetupId, meetupIds),
              ),
            })
          : [];
      const attendeesCountQuery = meetupIds.length
        ? ctx.db
            .select({
              count: count(Attendee.meetupId),
              meetupId: Attendee.meetupId,
            })
            .from(Attendee)
            .where(
              and(
                inArray(Attendee.meetupId, meetupIds),
                eq(Attendee.status, "going"),
              ),
            )
            .groupBy(Attendee.meetupId)
        : [];
      const [attendances, attendeesCount] = await Promise.all([
        attendancesQuery,
        attendeesCountQuery,
      ]);

      // combine meetups with the user's attendance status
      return {
        meetups: meetups.map((meetup) => {
          const endTime = new Date(
            meetup.startTime.getTime() + meetup.duration * 60 * 1000,
          );
          const goingCount =
            attendeesCount.find((a) => a.meetupId === meetup.id)?.count ?? 0;
          return {
            ...meetup,
            isOngoing: meetup.startTime < now && now < endTime,
            isOver: now > endTime,
            attendance: attendances.find((a) => a.meetupId === meetup.id),
            attendeesCount: goingCount,
            isFull:
              meetup.attendeeLimit != null &&
              goingCount >= meetup.attendeeLimit,
          };
        }),
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
      // enforce the attendee limit, unless the user is already going
      if (
        input.status === "going" &&
        meetup.attendeeLimit != null &&
        attendee?.status !== "going"
      ) {
        const [row] = await ctx.db
          .select({ going: count() })
          .from(Attendee)
          .where(
            and(eq(Attendee.meetupId, meetup.id), eq(Attendee.status, "going")),
          );
        if ((row?.going ?? 0) >= meetup.attendeeLimit) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "this meetup is full",
          });
        }
      }
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
      let recipients: {
        user: { email: string; id: string; name: string | null };
      }[] = [];
      // columns with a default are optional in the input; when omitted they
      // keep the stored value (update) or get the column default (create)
      let status: NonNullable<typeof data.status> = data.status ?? "active";
      let location = data.location ?? "";
      let duration = data.duration ?? 60;
      let description = data.description ?? "";
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
        status = data.status ?? meetup.status;
        location = data.location ?? meetup.location;
        duration = data.duration ?? meetup.duration;
        description = data.description ?? meetup.description;
        // only notify people who are going, and only about relevant changes
        // (description-only edits are not worth an email)
        const hasRelevantChange =
          data.startTime.getTime() !== meetup.startTime.getTime() ||
          location !== meetup.location ||
          status !== meetup.status ||
          data.title !== meetup.title ||
          duration !== meetup.duration;
        if (status !== "hidden" && hasRelevantChange) {
          recipients = meetup.attendees;
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
        meetupId = res[0].id;
        // announce new meetups to the whole group, unless they are hidden
        if (data.status !== "hidden") {
          recipients = group.members;
        }
      }
      const icsInvite = createEventUpdate({
        uuid: meetupId,
        title: data.title,
        description,
        start: data.startTime,
        duration,
        status: status === "cancelled" ? "CANCELLED" : "CONFIRMED",
        url: `https://www.laundryroom.social/meetup/${meetupId}`,
        location,
      });
      if (icsInvite.error) {
        console.error("failed to create ics invite", icsInvite.error);
      }
      const attachments = icsInvite.value
        ? [
            {
              filename: "invite.ics",
              content: icsInvite.value,
              contentType: "text/calendar",
            },
          ]
        : undefined;

      // the meetup is already saved at this point, so a failing email must not
      // fail the mutation. sends stay sequential on purpose: resend rate-limits
      // bursts (2 requests/second) and its sdk reports failures via the result
      // rather than by throwing, so firing all sends at once would drop most of them
      for (const member of recipients) {
        if (member.user.id === user.id) {
          continue;
        }
        try {
          await sendEmail(
            member.user.email,
            "eventUpdate",
            {
              isNew: !input.id,
              meetup: { ...data, id: meetupId, description, location },
              group,
            },
            attachments,
          );
        } catch (error) {
          console.error("failed to send meetup email", error);
        }
      }
      return { id: meetupId };
    }),
});
