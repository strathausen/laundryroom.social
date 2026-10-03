import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { db as Database } from "@laundryroom/db/client";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  ne,
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

import {
  ADMIN_ROLES,
  getGroupAccess,
  isActiveMember,
  isActiveMemberRow,
  isGroupAdmin,
  nsfwAllowed,
} from "../access";
import { protectedProcedure, publicProcedure } from "../trpc";

type Db = typeof Database;
type ModerationStatus = NonNullable<typeof Group.$inferSelect.moderationStatus>;
/** statuses assigned by moderation that an edit must not reset */
const manualModerationStatuses: ModerationStatus[] = [
  "rejected",
  "review",
  "reported",
];

// banned users must not learn about the ban. in a private group a ban looks
// like a join request that never gets answered - but only once they asked,
// a banned member who never asked sees "ask to join" like everyone else. a ban
// row holds such a request while its joined_at is later than its created_at
// (an insert sets both to the same now()): join sets it, leave (withdrawing
// the request) clears it, banning a join request keeps it. the only schema
// change for join requests is the "pending" role, so this lives in the
// existing timestamps instead of a column of its own
const askedToJoin = () => ({ joinedAt: sql`now()` });
const notAskedToJoin = () => ({ joinedAt: sql`${GroupMember.createdAt}` });
const hasAskedToJoin = () =>
  sql<boolean>`${GroupMember.joinedAt} > ${GroupMember.createdAt}`;

/** leaving, being removed or banned drops the rsvps for upcoming meetups */
function removeFutureRsvps(db: Db, groupId: string, userId: string) {
  return db.delete(Attendee).where(
    and(
      eq(Attendee.userId, userId),
      inArray(
        Attendee.meetupId,
        db
          .select({ id: Meetup.id })
          .from(Meetup)
          .where(
            and(eq(Meetup.groupId, groupId), gt(Meetup.startTime, new Date())),
          ),
      ),
    ),
  );
}

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
          AND ${isActiveMemberRow()}
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
      const access = await getGroupAccess(ctx.db, input.id, user?.id);
      const notFound = {
        group: undefined,
        membership: null,
        promotion: null,
        canSeeMeetups: false,
        canSeeMemberContent: false,
      };
      // archived groups are gone for everyone but their members
      if (!access || (!access.canSeeProfile && access.status === "archived")) {
        return notFound;
      }

      // the viewer's own membership. banned users must not learn about the
      // ban: in a private group they look like a join request that never gets
      // answered once they asked (see hasAskedToJoin), everywhere else like a
      // non-member (joining is a no-op)
      let banLooksPending = false;
      if (user && access.role === "banned" && access.status === "private") {
        const [ban] = await ctx.db
          .select({ asked: hasAskedToJoin() })
          .from(GroupMember)
          .where(
            and(
              eq(GroupMember.groupId, input.id),
              eq(GroupMember.userId, user.id),
            ),
          );
        banLooksPending = !!ban?.asked;
      }
      const role =
        access.role === "banned"
          ? banLooksPending
            ? ("pending" as const)
            : null
          : // a request left over from when the group was private: the group
            // is open now, and joining lets them in
            access.role === "pending" && access.status !== "private"
            ? null
            : access.role;
      const membership = role ? { role } : null;

      // private and nsfw groups: a stub, so the page can say why there is
      // nothing to see (log in first, or opt in to nsfw in the profile)
      if (!access.canSeeProfile) {
        return {
          group: {
            id: input.id,
            status: access.status,
            restriction:
              access.status === "nsfw" && user
                ? ("nsfw_opt_in" as const)
                : ("log_in" as const),
          },
          membership,
          promotion: null,
          canSeeMeetups: false,
          canSeeMemberContent: false,
        };
      }

      const [group, members, promotion] = await Promise.all([
        ctx.db.query.Group.findFirst({
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
            shortCodes: {
              limit: 1,
              columns: { code: true },
              orderBy: desc(GroupShortCode.createdAt),
            },
          },
        }),
        // the newest members, for members only and without roles or bans
        access.canSeeMemberContent
          ? ctx.db
              .select({ id: User.id, name: User.name, image: User.image })
              .from(GroupMember)
              .innerJoin(User, eq(GroupMember.userId, User.id))
              .where(
                and(eq(GroupMember.groupId, input.id), isActiveMemberRow()),
              )
              .orderBy(desc(GroupMember.joinedAt))
              .limit(10)
          : [],
        // only the owner can ask for a promotion, nobody else needs to know
        access.role === "owner"
          ? ctx.db.query.GroupPromotion.findFirst({
              columns: { id: true },
              where: and(
                eq(GroupPromotion.groupId, input.id),
                eq(GroupPromotion.promotionStatus, "promotable"),
              ),
            })
          : undefined,
      ]);
      if (!group) {
        return notFound;
      }
      return {
        group: { ...group, restriction: null, members },
        membership,
        promotion: promotion ?? null,
        canSeeMeetups: access.canSeeMeetups,
        canSeeMemberContent: access.canSeeMemberContent,
      };
    }),

  myGroups: publicProcedure.query(async ({ ctx }) => {
    const userId = ctx.session?.user.id;
    if (!userId) {
      return [];
    }

    const viewer = await ctx.db.query.User.findFirst({
      where: eq(User.id, userId),
      columns: { flags: true },
    });
    const groups = await ctx.db
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
          AND ${isActiveMemberRow()}
        )`.mapWith(Number),
        // hidden meetups are for owners, admins and moderators only
        nextMeetupDate: sql`(
          SELECT ${Meetup.startTime} FROM ${Meetup}
          WHERE ${Meetup.groupId} = ${Group.id}
          AND ${Meetup.startTime} > NOW()
          AND ${Meetup.status} <> 'hidden'
          ORDER BY ${Meetup.startTime} ASC LIMIT 1
        )`.mapWith(String),
      })
      .from(Group)
      .innerJoin(GroupMember, eq(GroupMember.groupId, Group.id))
      .where(
        and(
          eq(GroupMember.userId, userId),
          // bans and open join requests are not memberships
          isActiveMemberRow(),
        ),
      )
      .orderBy(desc(Group.createdAt));
    // nsfw groups only show up for people who opted in
    return groups.filter((group) => nsfwAllowed(group.status, viewer?.flags));
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

        if (!membership || !isGroupAdmin(membership.role)) {
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

      const [group, existingMembership] = await Promise.all([
        ctx.db.query.Group.findFirst({
          columns: { id: true, name: true, status: true },
          where: eq(Group.id, groupId),
        }),
        ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, userId),
          ),
        }),
      ]);
      // archived groups are gone for everyone but their members (see byId)
      if (
        !group ||
        (group.status === "archived" &&
          !isActiveMember(existingMembership?.role))
      ) {
        throw new TRPCError({ code: "NOT_FOUND", message: "group not found" });
      }
      if (group.status === "archived") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "this group is archived",
        });
      }
      if (group.status === "nsfw") {
        const user = await ctx.db.query.User.findFirst({
          where: eq(User.id, userId),
          columns: { flags: true },
        });
        if (!nsfwAllowed(group.status, user?.flags)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "this group is nsfw, turn on nsfw mode in your profile first",
          });
        }
      }

      // the membership row is written when this runs; a notification failure
      // must not fail the join
      const notifyOwner = async () => {
        try {
          const ownerMembership = await ctx.db.query.GroupMember.findFirst({
            where: and(
              eq(GroupMember.groupId, groupId),
              eq(GroupMember.role, "owner"),
            ),
            with: {
              user: {
                columns: { id: true, email: true, name: true, flags: true },
              },
              group: { columns: { id: true, name: true } },
            },
          });

          // Ideally this should not happen, we need to find a way to handle this
          if (!ownerMembership) {
            console.error(
              `group ${groupId} has no owner, skipping new member notification`,
            );
          } else if (nsfwAllowed(group.status, ownerMembership.user.flags)) {
            // an owner who opted out of nsfw gets no mail about an nsfw group
            await sendEmail(ownerMembership.user.email, "newMember", {
              member: ctx.session.user,
              group: ownerMembership.group,
              user: ownerMembership.user,
            });
          }
        } catch (err) {
          console.error("failed to send new member notification", err);
        }
      };

      // already a member (or already asked): nothing to do, except for these.
      // banned users keep their ban row and must not learn that they are
      // banned: in a private group their request now counts as sent, so it
      // looks pending like any other (see hasAskedToJoin), and nobody is told
      if (existingMembership?.role === "banned" && group.status === "private") {
        await ctx.db
          .update(GroupMember)
          .set(askedToJoin())
          .where(
            and(
              eq(GroupMember.groupId, groupId),
              eq(GroupMember.userId, userId),
              eq(GroupMember.role, "banned"),
            ),
          );
      }
      // a request left over from when the group was private: it's open now
      if (
        existingMembership?.role === "pending" &&
        group.status !== "private"
      ) {
        const [approved] = await ctx.db
          .update(GroupMember)
          .set({ role: "member" })
          .where(
            and(
              eq(GroupMember.groupId, groupId),
              eq(GroupMember.userId, userId),
              eq(GroupMember.role, "pending"),
            ),
          )
          .returning({ userId: GroupMember.userId });
        if (approved) {
          await notifyOwner();
        }
      }
      if (existingMembership) {
        return { success: true };
      }

      // private groups: people ask to join, an owner or admin lets them in
      const role = group.status === "private" ? "pending" : "member";
      // two concurrent joins (double-click, two tabs) can both pass the check
      // above; the second must not fail on the (group_id, user_id) primary key
      // and must not notify a second time
      const [inserted] = await ctx.db
        .insert(GroupMember)
        .values({ groupId, userId, role })
        .onConflictDoNothing({
          target: [GroupMember.groupId, GroupMember.userId],
        })
        .returning({ userId: GroupMember.userId });
      if (!inserted) {
        return { success: true };
      }

      if (role === "member") {
        await notifyOwner();
        return { success: true };
      }

      // every request emails the owner and admins, also after the requester
      // withdrew (leave deletes the row) or was declined and asks again. an
      // admin who has had enough bans the request (changeRole): it stays
      // "sent" for them, and join and leave no longer notify anyone
      try {
        const admins = await ctx.db.query.GroupMember.findMany({
          where: and(
            eq(GroupMember.groupId, groupId),
            inArray(GroupMember.role, [...ADMIN_ROLES]),
          ),
          with: { user: { columns: { id: true, email: true, name: true } } },
        });
        // sequential on purpose, resend rate-limits bursts (see meetup.upsert)
        for (const admin of admins) {
          try {
            await sendEmail(admin.user.email, "joinRequest", {
              member: ctx.session.user,
              group,
              user: admin.user,
            });
          } catch (err) {
            console.error("failed to send join request notification", err);
          }
        }
      } catch (err) {
        console.error("failed to look up admins for a join request", err);
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
      if (!membership) {
        return;
      }
      // banned users must keep their ban row, otherwise they could leave and
      // re-join, and must not learn about it: leaving withdraws their (never
      // answered) join request, see hasAskedToJoin
      if (membership.role === "banned") {
        await ctx.db
          .update(GroupMember)
          .set(notAskedToJoin())
          .where(
            and(
              eq(GroupMember.groupId, groupId),
              eq(GroupMember.userId, userId),
              eq(GroupMember.role, "banned"),
            ),
          );
        return;
      }
      if (membership.role === "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "transfer ownership before leaving",
        });
      }

      // a pending join request is withdrawn by leaving. the role condition
      // keeps a concurrent ownership transfer (or ban) from being deleted
      await Promise.all([
        ctx.db
          .delete(GroupMember)
          .where(
            and(
              eq(GroupMember.groupId, groupId),
              eq(GroupMember.userId, userId),
              eq(GroupMember.role, membership.role),
            ),
          ),
        removeFutureRsvps(ctx.db, groupId, userId),
      ]);
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

      if (!membership || !isGroupAdmin(membership.role)) {
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

      // the checks above read target.role outside of any transaction: only
      // delete the row if it still has that role, so e.g. a concurrent
      // ownership transfer to the target cannot leave the group without owner
      const [removed] = await ctx.db
        .delete(GroupMember)
        .where(
          and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, targetUserId),
            eq(GroupMember.role, target.role),
          ),
        )
        .returning({ userId: GroupMember.userId });
      if (!removed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "this member just changed, reload and try again",
        });
      }
      await removeFutureRsvps(ctx.db, groupId, targetUserId);
      return { success: true };
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

      if (!isGroupAdmin(membership?.role)) {
        throw new Error("Not authorized");
      }

      return ctx.db.update(Group).set({ status }).where(eq(Group.id, groupId));
    }),

  members: protectedProcedure
    .input(z.object({ groupId: z.string(), search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { groupId, search } = input;
      const userId = ctx.session.user.id;
      // check if the user searching is also a member
      const access = await getGroupAccess(ctx.db, groupId, userId);
      // banned members (who must not learn about the ban), open join requests
      // and members of an nsfw group who opted out get the same answer as
      // everyone else who is not in the group
      if (!access?.canSeeMemberContent) {
        throw new Error("not authorized");
      }
      const isAdmin = isGroupAdmin(access.role);

      const [members, requests, membersCount] = await Promise.all([
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
              // only admins get to see banned members, join requests are
              // listed separately
              isAdmin ? ne(GroupMember.role, "pending") : isActiveMemberRow(),
              search ? ilike(User.name, `%${search}%`) : undefined,
            ),
          )
          .limit(10),
        // open join requests, for the owner and admins to approve or decline
        isAdmin
          ? ctx.db
              .select({ userId: User.id, userName: User.name })
              .from(GroupMember)
              .innerJoin(User, eq(GroupMember.userId, User.id))
              .where(
                and(
                  eq(GroupMember.groupId, groupId),
                  eq(GroupMember.role, "pending"),
                ),
              )
              .orderBy(asc(GroupMember.joinedAt))
              .limit(50)
          : [],
        ctx.db
          .select({ count: count() })
          .from(GroupMember)
          .where(and(eq(GroupMember.groupId, groupId), isActiveMemberRow())),
      ]);

      return {
        // non-admins don't get to see roles, everyone is just a "member"
        members: isAdmin
          ? members
          : members.map((member) => ({ ...member, role: "member" as const })),
        requests,
        count: membersCount[0]?.count ?? 0,
        role: access.role,
        // the viewer's own id, so the client can mirror the role-change rules
        userId,
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

      if (!membership || !isGroupAdmin(membership.role)) {
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
      // a join request is approved (-> member) or banned here, or declined
      // via removeMember, nothing else
      if (target.role === "pending" && role !== "member" && role !== "banned") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "approve, ban or decline the join request first",
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

      const isNewBan = role === "banned" && target.role !== "banned";
      // the checks above read target.role outside of any transaction: only
      // write if the row still has that role, so e.g. a concurrent ownership
      // transfer to the target cannot be overwritten (a group without owner)
      const [changed] = await ctx.db
        .update(GroupMember)
        .set({
          role,
          // a banned join request still looks "sent" to the requester, a
          // banned member sees "ask to join" (see hasAskedToJoin)
          ...(isNewBan
            ? target.role === "pending"
              ? askedToJoin()
              : notAskedToJoin()
            : {}),
        })
        .where(
          and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, targetUserId),
            eq(GroupMember.role, target.role),
          ),
        )
        .returning({ userId: GroupMember.userId });
      if (!changed) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "this member just changed, reload and try again",
        });
      }
      // banned users are out: they no longer show up as going
      if (isNewBan) {
        await removeFutureRsvps(ctx.db, groupId, targetUserId);
      }
      return { success: true };
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
      if (!isActiveMember(target.role)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            target.role === "pending"
              ? "approve their join request first"
              : "cannot transfer ownership to a banned user",
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
              isActiveMemberRow(),
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
