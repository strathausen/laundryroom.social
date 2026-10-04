/**
 * Every nsid, space type, space key, token, label value and opensocial action
 * string laundryroom uses. This is the only hand-written module where they are
 * spelled out (the generated code in src/lexicons/ aside); everything else
 * imports them from here.
 *
 * None of these values may be encoded in a postgres enum (pgEnum, check
 * constraint or similar). Store them as text, so that a rename, such as
 * group.opensocial.* becoming group.intermodal.*, is one commit here plus a
 * re-write of the group-authored records.
 *
 * See docs/atproto-plan.md, "nsids and how stable they are".
 */

/**
 * The commit of the opensocial.group draft
 * (https://tangled.org/opensocial.group/proposal, 2026-09-29) that every
 * group.opensocial.* nsid, action string and record shape below follows.
 * Bump it together with any change to those values.
 */
export const OPENSOCIAL_REV = "d2c89a9744afad46ce815e507164550935f14ad1";

export const NSID = {
  // community.lexicon.*: published by lexicon.community
  // (did:plc:mtr7qrqtcyseedx3jyr5o7db); stable, additive changes only.
  // lexicons/ holds the published com.atproto.lexicon.schema records, fetched
  // with `lex install` on 2026-10-04 (record cids pinned in lexicons.json).
  // they equal tangled.org/lexicon.community/lexicons at ddcaad2
  // (2025-03-01); calendar.event's rsvpExpected (91c50cb, 2026-05-18) is in
  // git but not published, so it is not in our copy.
  event: "community.lexicon.calendar.event",
  rsvp: "community.lexicon.calendar.rsvp",
  locationAddress: "community.lexicon.location.address",
  locationFsq: "community.lexicon.location.fsq",
  locationGeo: "community.lexicon.location.geo",
  locationHthree: "community.lexicon.location.hthree",

  // com.atproto.* and app.bsky.*: stable. app.bsky.actor.profile is only
  // read, as the fallback for a person's name and avatar.
  strongRef: "com.atproto.repo.strongRef",
  labelDefs: "com.atproto.label.defs",
  bskyActorProfile: "app.bsky.actor.profile",

  // group.opensocial.*: UNSTABLE. an unpublished draft at OPENSOCIAL_REV
  // (there is no _lexicon.opensocial.group txt record). the whole namespace
  // may be renamed to group.intermodal.* (discourse 1268), and the label may
  // move to a com.atproto record (opensocial issue #3). acceptance, invite and
  // invites are deliberately absent: requesting a space:group.opensocial.*
  // scope fails the whole login with invalid_scope while the declarations are
  // unpublished.
  /** UNSTABLE (opensocial draft). shared defs (subjects, actions, roles). */
  groupDefs: "group.opensocial.defs",
  /** UNSTABLE (opensocial draft). space type: group presence, profile, rules. */
  groupMeta: "group.opensocial.meta",
  /** UNSTABLE (opensocial draft). space type: roles, memberships, space index. */
  groupMembers: "group.opensocial.members",
  /** UNSTABLE (opensocial draft). record, meta/self, rkey self. */
  groupProfile: "group.opensocial.profile",
  /** UNSTABLE (opensocial draft). record, meta/self. */
  groupRule: "group.opensocial.rule",
  /** UNSTABLE (opensocial draft). record, members/self, rkey self. */
  groupPermissions: "group.opensocial.permissions",
  /** UNSTABLE (opensocial draft). record, members/self, rkey = role id. */
  groupRole: "group.opensocial.role",
  /** UNSTABLE (opensocial draft). record, members/self, rkey = member did. */
  groupMembership: "group.opensocial.membership",
  /** UNSTABLE (opensocial draft). record, members/self: one per space. */
  groupSpace: "group.opensocial.space",
  /** UNSTABLE (opensocial draft). record, in every space, rkey self. */
  groupAccess: "group.opensocial.access",
  /** UNSTABLE (opensocial draft). record, in the labelled record's space. */
  groupLabel: "group.opensocial.label",
  /** UNSTABLE (opensocial draft). record, group's public repo, rkey self. */
  groupDeclaration: "group.opensocial.declaration",

  // social.laundryroom.*: ours, published from the laundryroom.social lexicon
  // account. free to change until the first production write of each; after
  // that additive only (a breaking change means a new nsid). the records
  // stored in spaces point at other space records through strongRefs, whose
  // `uri` is `format: at-uri`; if ga moves space uris to `ats://`, check that
  // the format still covers them before the first production write.
  /** space type (alpha lexicon syntax, see lexicons-alpha/). */
  calendarSpace: "social.laundryroom.calendar",
  /** space type (alpha lexicon syntax, see lexicons-alpha/). */
  forumSpace: "social.laundryroom.forum",
  /** permission set; its space entries are alpha-only. */
  authFull: "social.laundryroom.authFull",
  actorProfile: "social.laundryroom.actor.profile",
  laundryroomGroupProfile: "social.laundryroom.group.profile",
  eventInfo: "social.laundryroom.calendar.eventInfo",
  attendance: "social.laundryroom.calendar.attendance",
  pledgeBoard: "social.laundryroom.pledge.board",
  pledgeItem: "social.laundryroom.pledge.item",
  pledgeFulfillment: "social.laundryroom.pledge.fulfillment",
  thread: "social.laundryroom.forum.thread",
  reply: "social.laundryroom.forum.reply",

  // com.atproto.space.* / com.atproto.simplespace.*: ALPHA (the spaces alpha,
  // breaks weekly). only the alpha-only spaces package (phase 5) may call
  // these methods.
  simplespaceDefs: "com.atproto.simplespace.defs",
} as const;

/**
 * XRPC methods laundryroom calls by name. The com.atproto.space.* and
 * com.atproto.simplespace.* methods are called only by the spaces package,
 * through its generated alpha schemas, and are not listed here.
 */
export const XRPC = {
  /** the person's own session; carries the email with account:email */
  serverGetSession: "com.atproto.server.getSession",
  /** a bluesky profile, for the display name fallback */
  bskyActorGetProfile: "app.bsky.actor.getProfile",
} as const;

export type NsidKey = keyof typeof NSID;
export type Nsid = (typeof NSID)[NsidKey];

/** The space types laundryroom creates (simplespace `spaceType`). */
export const SPACE_TYPES = [
  NSID.groupMeta,
  NSID.groupMembers,
  NSID.calendarSpace,
  NSID.forumSpace,
] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

/** Space keys (skey). */
export const SKEY = {
  self: "self",
  /** the staff calendar: hidden meetups, owners/admins/moderators only */
  staff: "staff",
} as const;
export type SpaceKey = (typeof SKEY)[keyof typeof SKEY];

/**
 * The spaces every group has, by role. See docs/atproto-plan.md, "which space
 * holds what (per group)". The authority of each is the group's did.
 */
export const GROUP_SPACES = {
  meta: { type: NSID.groupMeta, skey: SKEY.self },
  members: { type: NSID.groupMembers, skey: SKEY.self },
  calendar: { type: NSID.calendarSpace, skey: SKEY.self },
  staffCalendar: { type: NSID.calendarSpace, skey: SKEY.staff },
  forum: { type: NSID.forumSpace, skey: SKEY.self },
} as const satisfies Record<string, { type: SpaceType; skey: SpaceKey }>;
export type GroupSpaceName = keyof typeof GROUP_SPACES;

/**
 * The record collections laundryroom writes and validates with
 * src/validate.ts. group.opensocial.* records are not in this list yet: their
 * lexicons are an unpublished draft and are not part of the stable codegen
 * (see OPENSOCIAL_RECORD_NSIDS).
 */
export const RECORD_NSIDS = [
  NSID.event,
  NSID.rsvp,
  NSID.actorProfile,
  NSID.laundryroomGroupProfile,
  NSID.eventInfo,
  NSID.attendance,
  NSID.pledgeBoard,
  NSID.pledgeItem,
  NSID.pledgeFulfillment,
  NSID.thread,
  NSID.reply,
] as const;
export type RecordNsid = (typeof RECORD_NSIDS)[number];

/**
 * UNSTABLE (opensocial draft at OPENSOCIAL_REV): the group.opensocial.*
 * records the group writes. Not validated locally (no codegen for the draft).
 */
export const OPENSOCIAL_RECORD_NSIDS = [
  NSID.groupProfile,
  NSID.groupRule,
  NSID.groupPermissions,
  NSID.groupRole,
  NSID.groupMembership,
  NSID.groupSpace,
  NSID.groupAccess,
  NSID.groupLabel,
  NSID.groupDeclaration,
] as const;
export type OpensocialRecordNsid = (typeof OPENSOCIAL_RECORD_NSIDS)[number];

/** community.lexicon.calendar.rsvp `status` values. */
export const RSVP_STATUS = {
  going: `${NSID.rsvp}#going`,
  notGoing: `${NSID.rsvp}#notgoing`,
  /** not used by laundryroom; other apps may send it */
  interested: `${NSID.rsvp}#interested`,
} as const;

/** community.lexicon.calendar.event `status` values. */
export const EVENT_STATUS = {
  /** meetup status active and full */
  scheduled: `${NSID.event}#scheduled`,
  cancelled: `${NSID.event}#cancelled`,
  postponed: `${NSID.event}#postponed`,
  /** not used by laundryroom; other apps may send it */
  planned: `${NSID.event}#planned`,
  /** not used by laundryroom; other apps may send it */
  rescheduled: `${NSID.event}#rescheduled`,
} as const;

/** community.lexicon.calendar.event `mode` values. */
export const EVENT_MODE = {
  inPerson: `${NSID.event}#inperson`,
  virtual: `${NSID.event}#virtual`,
  hybrid: `${NSID.event}#hybrid`,
} as const;

/** `$type` of the self-labels object in social.laundryroom.group.profile. */
export const SELF_LABELS_TYPE = `${NSID.labelDefs}#selfLabels` as const;

/**
 * UNSTABLE (opensocial draft at OPENSOCIAL_REV): the `subject` variants of a
 * group.opensocial.label.
 */
export const OPENSOCIAL_LABEL_SUBJECT = {
  account: `${NSID.groupDefs}#accountSubject`,
  record: `${NSID.groupDefs}#recordSubject`,
} as const;

/** Values of group.opensocial.label `val` that laundryroom writes. */
export const LABEL_VAL = {
  /** account label in members/self on a banned member */
  takedown: "!takedown",
  /** record label on a removed post, in the post's own space */
  hide: "!hide",
} as const;

/**
 * UNSTABLE (opensocial draft at OPENSOCIAL_REV): group.opensocial.defs#action.
 * These will probably become nsids (opensocial issue #7).
 */
export const OPENSOCIAL_ACTIONS = [
  "mod.read",
  "mod.resolve",
  "label",
  "takedown",
  "invite",
  "admit",
  "eject",
  "role.assign",
  "space.create",
  "space.configure",
  "space.delete",
  "group.configure",
] as const;
export type OpensocialAction = (typeof OPENSOCIAL_ACTIONS)[number];

/** UNSTABLE (opensocial draft): group.opensocial.defs#joinPolicy. */
export const JOIN_POLICY = {
  /** active and hidden groups */
  open: "open",
  /** private and nsfw groups */
  approval: "approval",
  /** not used by laundryroom */
  invite: "invite",
} as const;
export type JoinPolicy = (typeof JOIN_POLICY)[keyof typeof JOIN_POLICY];

/**
 * group.opensocial.role ids (rkeys) laundryroom writes. Opensocial treats
 * role names as conventions; these mirror group_member.role. pending and
 * banned members have no role (see docs/atproto-plan.md, "roles, join
 * requests and bans in opensocial terms").
 */
export const ROLE = {
  owner: "owner",
  admin: "admin",
  moderator: "moderator",
  member: "member",
} as const;
export type Role = (typeof ROLE)[keyof typeof ROLE];

/**
 * UNSTABLE (opensocial draft): the group.opensocial.permissions/self role
 * bindings laundryroom writes. access.ts stays the source of truth; these
 * only mirror its intent for other apps and a future group host.
 */
export const ROLE_BINDINGS = {
  owner: {
    actions: OPENSOCIAL_ACTIONS,
    assignable: [ROLE.owner, ROLE.admin, ROLE.moderator, ROLE.member],
  },
  admin: {
    actions: OPENSOCIAL_ACTIONS.filter((a) => a !== "space.delete"),
    assignable: [ROLE.moderator, ROLE.member],
  },
  // today's moderators see hidden meetups and moderate; they do not admit
  moderator: {
    actions: ["mod.read", "mod.resolve", "label"],
    assignable: [],
  },
  member: { actions: [], assignable: [] },
} as const satisfies Record<
  Role,
  { actions: readonly OpensocialAction[]; assignable: readonly Role[] }
>;

/** group.opensocial.permissions `defaultRoles`. */
export const DEFAULT_ROLES = [ROLE.member] as const;

/**
 * ALPHA (com.atproto.simplespace.*, breaks weekly): the policy `$type`s
 * laundryroom uses when it creates a simplespace.
 */
export const SIMPLESPACE_POLICY = {
  /** read or write limited to the space's member list */
  memberList: `${NSID.simplespaceDefs}#memberListPolicy`,
  /** read open to any signed-in atproto user */
  public: `${NSID.simplespaceDefs}#publicPolicy`,
  /** appAccess: any app may get a credential */
  openApps: `${NSID.simplespaceDefs}#open`,
} as const;
