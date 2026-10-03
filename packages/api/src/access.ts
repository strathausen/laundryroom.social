import type { db as Database } from "@laundryroom/db/client";
import { and, eq, inArray } from "@laundryroom/db";
import { Group, GroupMember, User } from "@laundryroom/db/schema";

type Db = typeof Database;
export type GroupMemberRole = (typeof GroupMember.$inferSelect)["role"];
export type GroupStatus = (typeof Group.$inferSelect)["status"];

/**
 * The roles that make someone a member of a group. "banned" and "pending" (a
 * join request for a private group nobody has approved yet) have a
 * group_member row too, but are not in the group: no content, not counted, no
 * emails. Every "is this person in the group?" check goes through this list.
 */
export const ACTIVE_MEMBER_ROLES = [
  "owner",
  "admin",
  "moderator",
  "member",
] as const satisfies readonly GroupMemberRole[];
export type ActiveMemberRole = (typeof ACTIVE_MEMBER_ROLES)[number];

/** may change the group, its meetups, members and pledge boards */
export const ADMIN_ROLES = [
  "owner",
  "admin",
] as const satisfies readonly ActiveMemberRole[];

/** may see hidden meetups */
export const MEETUP_MODERATOR_ROLES = [
  "owner",
  "admin",
  "moderator",
] as const satisfies readonly ActiveMemberRole[];

const includes = (roles: readonly string[], role: string | null | undefined) =>
  role != null && roles.includes(role);

export function isActiveMember(
  role: GroupMemberRole | null | undefined,
): role is ActiveMemberRole {
  return includes(ACTIVE_MEMBER_ROLES, role);
}

export function isGroupAdmin(role: GroupMemberRole | null | undefined) {
  return includes(ADMIN_ROLES, role);
}

export function canSeeHiddenMeetups(role: GroupMemberRole | null | undefined) {
  return includes(MEETUP_MODERATOR_ROLES, role);
}

/** sql condition for group_member rows of active members */
export const isActiveMemberRow = () =>
  inArray(GroupMember.role, [...ACTIVE_MEMBER_ROLES]);

type UserFlag = NonNullable<(typeof User.$inferSelect)["flags"]>[number];

/** nsfw groups only exist for people who opted in (user flag "nsfw") */
export function nsfwAllowed(
  status: GroupStatus,
  flags: readonly UserFlag[] | null | undefined,
) {
  return status !== "nsfw" || !!flags?.includes("nsfw");
}

export interface GroupAccess {
  status: GroupStatus;
  /** the viewer's group_member role, banned and pending included */
  role: GroupMemberRole | null;
  isActiveMember: boolean;
  /** name, description, image, location, time zone */
  canSeeProfile: boolean;
  /** the meetup list and meetup details (without who is going) */
  canSeeMeetups: boolean;
  /** attendee names, discussions, comments, the member list, pledge boards */
  canSeeMemberContent: boolean;
}

/**
 * Who may see what of a group, from its status (null counts as active):
 *
 * - active / hidden: profile and meetups for everyone, the rest for members
 * - private: profile for logged-in users (so they can ask to join), the rest
 *   for members
 * - nsfw: like private, but only for people who opted in to nsfw
 * - archived: members only
 */
export function resolveGroupAccess(opts: {
  status: GroupStatus;
  role: GroupMemberRole | null;
  isLoggedIn: boolean;
  nsfwOptIn: boolean;
}): GroupAccess {
  const { status, role, isLoggedIn, nsfwOptIn } = opts;
  const member = isActiveMember(role);
  const access = { status, role, isActiveMember: member };
  switch (status ?? "active") {
    case "active":
    case "hidden":
      return {
        ...access,
        canSeeProfile: true,
        canSeeMeetups: true,
        canSeeMemberContent: member,
      };
    case "private":
      return {
        ...access,
        canSeeProfile: isLoggedIn,
        canSeeMeetups: member,
        canSeeMemberContent: member,
      };
    case "nsfw":
      return {
        ...access,
        canSeeProfile: isLoggedIn && nsfwOptIn,
        canSeeMeetups: member && nsfwOptIn,
        canSeeMemberContent: member && nsfwOptIn,
      };
    case "archived":
      return {
        ...access,
        canSeeProfile: member,
        canSeeMeetups: member,
        canSeeMemberContent: member,
      };
  }
}

/**
 * What `userId` (undefined: an anonymous visitor) may see of a group, or null
 * when the group does not exist.
 */
export async function getGroupAccess(
  db: Db,
  groupId: string,
  userId: string | undefined,
): Promise<GroupAccess | null> {
  const [group, membership] = await Promise.all([
    db.query.Group.findFirst({
      where: eq(Group.id, groupId),
      columns: { status: true },
    }),
    userId
      ? db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, groupId),
            eq(GroupMember.userId, userId),
          ),
          columns: { role: true },
        })
      : undefined,
  ]);
  if (!group) {
    return null;
  }
  // the session does not carry the user's flags, and only nsfw groups need them
  const viewer =
    group.status === "nsfw" && userId
      ? await db.query.User.findFirst({
          where: eq(User.id, userId),
          columns: { flags: true },
        })
      : undefined;
  return resolveGroupAccess({
    status: group.status,
    role: membership?.role ?? null,
    isLoggedIn: !!userId,
    nsfwOptIn: nsfwAllowed(group.status, viewer?.flags),
  });
}
