/**
 * What a group puts on the network, and when. See docs/atproto-plan.md,
 * "where things go, by group status", "table by table" (the `group` row) and
 * "no new leaks".
 */
import type { DatetimeString } from "@atproto/lex";

import type { GroupStatus } from "../interfaces";
import type { NSID } from "../nsid";
import type { RecordFields } from "../validate";
import type { GroupHandleIntent } from "./handle";

/**
 * Whether a group is public on the network: it has a readable handle and a
 * public social.laundryroom.group.profile/self, and later (phase 4) public
 * mirrors of its meetups. Only active groups that moderation left alone,
 * the same rule as the sitemap and the group search: anything published is
 * copied by relays and other apps and cannot be taken back. A missing status
 * counts as active, like in access.ts.
 *
 * Every other group (hidden, private, nsfw, archived, or flagged by
 * moderation) publishes nothing but an opaque handle.
 */
export function publishesOnNetwork(group: {
  status: GroupStatus | null;
  moderationStatus: string | null;
}): boolean {
  return (
    (group.status ?? "active") === "active" &&
    (group.moderationStatus ?? "ok") === "ok"
  );
}

/** The handle a group should have right now (see publishesOnNetwork). */
export function groupHandleIntent(group: {
  name: string;
  status: GroupStatus | null;
  moderationStatus: string | null;
}): GroupHandleIntent {
  return publishesOnNetwork(group)
    ? { kind: "readable", name: group.name }
    : { kind: "opaque" };
}

/** The profile record's fields, without the avatar (a blob, set by the host). */
export type GroupProfileFields = Omit<
  RecordFields<typeof NSID.laundryroomGroupProfile>,
  "avatar" | "avatarAlt"
>;

/** The group row fields the profile is built from. */
export interface GroupProfileSource {
  name: string;
  description: string | null;
  location: string | null;
  timeZone: string | null;
  createdAt: Date | string;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const utf8 = new TextEncoder();

/**
 * Cuts `text` to at most `maxGraphemes` grapheme clusters and `maxBytes`
 * utf-8 bytes (a lexicon string's maxGraphemes and maxLength), never in the
 * middle of a grapheme, and trims surrounding whitespace.
 */
export function truncateText(
  text: string,
  limits: { maxGraphemes: number; maxBytes: number },
): string {
  let out = "";
  let bytes = 0;
  let graphemes = 0;
  for (const { segment } of segmenter.segment(text.trim())) {
    const size = utf8.encode(segment).length;
    if (graphemes + 1 > limits.maxGraphemes || bytes + size > limits.maxBytes) {
      break;
    }
    out += segment;
    bytes += size;
    graphemes++;
  }
  return out.trim();
}

/** Lexicon limits of social.laundryroom.group.profile (lexicons/…/profile.json). */
const LIMITS = {
  displayName: { maxGraphemes: 64, maxBytes: 640 },
  description: { maxGraphemes: 2000, maxBytes: 20000 },
  locationName: { maxGraphemes: 255, maxBytes: 2550 },
  avatarAlt: { maxGraphemes: 1000, maxBytes: 10000 },
} as const;
const TIME_ZONE_MAX_LENGTH = 64;

/**
 * The public profile of a group, mapped from its row as the plan says:
 * displayName ← name (cut to 64 graphemes), description, locationName ←
 * location (free text), timeZone, createdAt ← created_at (unchanged by
 * edits). Nothing about members, roles or meetups. Empty values are left
 * out. The caller validates the result with buildRecord before writing.
 */
export function groupProfileFields(
  group: GroupProfileSource,
): GroupProfileFields {
  const description = truncateText(group.description ?? "", LIMITS.description);
  const locationName = truncateText(group.location ?? "", LIMITS.locationName);
  const timeZone = group.timeZone?.trim();
  return {
    displayName: truncateText(group.name, LIMITS.displayName),
    ...(description ? { description } : {}),
    ...(locationName ? { locationName } : {}),
    ...(timeZone && timeZone.length <= TIME_ZONE_MAX_LENGTH
      ? { timeZone }
      : {}),
    // toISOString is always a valid atproto datetime
    createdAt: new Date(group.createdAt).toISOString() as DatetimeString,
  };
}

/** The avatar's alt text (image_description), cut to the lexicon's limits. */
export function groupAvatarAlt(
  imageDescription: string | null,
): string | undefined {
  const alt = truncateText(imageDescription ?? "", LIMITS.avatarAlt);
  return alt || undefined;
}
