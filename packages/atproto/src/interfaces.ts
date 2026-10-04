/**
 * The seams that keep the experimental parts (the spaces alpha, the
 * opensocial.group draft, custodied group accounts) swappable. Interfaces
 * only; the implementations arrive in phases 3 (LocalPdsGroupHost), 5 (forum)
 * and 6 (everything else). See docs/atproto-plan.md, "how the app acts as the
 * group" and "containing the alpha: adapter, guardrails, weekly routine".
 *
 * The spaces alpha itself goes into its own alpha-only package (phase 5, with
 * exact pins of the alpha @atproto/* versions): the phase-0 spike showed the
 * stable and alpha @atproto/lex cannot share one package, and that their
 * classes (AtUri, Client, generated schemas) do not cross between them. So
 * nothing here hands that package a class: sessions go in as an `Agent`
 * (`{ did, fetchHandler }`), references as plain data.
 */
import type {
  Agent,
  AtUriString,
  CidString,
  DatetimeString,
  DidString,
  RecordKeyString,
} from "@atproto/lex";

import type {
  GroupSpaceName,
  JoinPolicy,
  LABEL_VAL,
  NSID,
  OpensocialRecordNsid,
  RecordNsid,
  SpaceKey,
  SpaceType,
} from "./nsid";
import type { RecordFields, RecordValue } from "./validate";

// ---------------------------------------------------------------------------
// references

/**
 * A space: the (authority, type, skey) triple. Nothing outside the
 * alpha-only spaces package turns it into a uri or parses one, because the
 * scheme is still debated (`at://<authority>/space/<type>/<skey>` today,
 * `ats://` proposed), and the stable AtUri misparses it. See
 * docs/atproto-plan.md, "containing the alpha".
 */
export interface SpaceRef {
  /** the did whose pds hosts the space; for group spaces, the group's did */
  authority: DidString;
  type: SpaceType;
  skey: SpaceKey;
}

/**
 * Where a record is stored, as the `source` column of the record index says
 * (docs/atproto-plan.md, "the appview" and "local records"):
 * - `repo`: the author's public repo, on the firehose;
 * - `space`: the author's repo inside a space;
 * - `local`: only in laundryroom's index, for a member whose pds has no
 *   spaces yet. Never published; lifted into their space repo later, under
 *   the same rkey, and then becomes `space`.
 */
export type RecordSource = "repo" | "space" | "local";

/** Every collection a RecordRef can point into. */
export type CollectionNsid = RecordNsid | OpensocialRecordNsid;

interface RecordRefFields {
  uri: AtUriString;
  cid: CidString;
  /** the author: the repo the record is in */
  repo: DidString;
  collection: CollectionNsid;
  rkey: RecordKeyString;
}

/**
 * A written record. `uri` + `cid` form the com.atproto.repo.strongRef that
 * other records point at. For space and local records `uri` is the uri the
 * record has (or will have, once lifted) in the space, built by the spaces
 * package from `space`, `repo`, `collection` and `rkey`; use those fields
 * instead of parsing `uri`.
 */
export type RecordRef =
  | (RecordRefFields & { source: "repo"; space?: never })
  | (RecordRefFields & {
      source: Exclude<RecordSource, "repo">;
      /** the space the record is in, or will be lifted into */
      space: SpaceRef;
    });

/** The two fields of a com.atproto.repo.strongRef. */
export type StrongRef = Pick<RecordRef, "uri" | "cid">;

/**
 * Identifies stored content across stores. A feature stays in today's
 * postgres tables (`row`, PostgresStore) until it moves onto spaces and local
 * records (`record`): discussions in phase 5, everything else in phase 6.
 */
export type ContentRef =
  | { kind: "row"; id: string }
  | { kind: "record"; ref: RecordRef };

// ---------------------------------------------------------------------------
// group host

/** group.status, see resolveGroupAccess in packages/api/src/access.ts. */
export type GroupStatus = "active" | "hidden" | "private" | "nsfw" | "archived";

/** A simplespace member list entry (com.atproto.simplespace.putMember). */
export interface SpaceMember {
  did: DidString;
  read: boolean;
  write: boolean;
}

/**
 * Who may read or write a space. `public` means any signed-in atproto user
 * (simplespace publicPolicy), never anonymous visitors; `memberList` means
 * the dids laundryroom put with putMember. See docs/atproto-plan.md, "which
 * space holds what (per group)".
 */
export type SpacePolicy = "public" | "memberList";

/**
 * Group accounts on pds.lndry.social and everything done as the group.
 * Today's implementation is LocalPdsGroupHost (laundryroom holds the group's
 * app password and master password); an OpensocialGroupHost with nested
 * oauth replaces it once a real group host exists, or if ga stops accepting
 * app-password writes to spaces. Every call happens in the worker, after the
 * access.ts check in trpc; the browser never holds group credentials.
 *
 * See docs/atproto-plan.md, "group accounts on lndry.social", "how the app
 * acts as the group" and "roles, join requests and bans in opensocial terms".
 */
export interface GroupHost {
  /**
   * Creates the group's did:plc account, its custodied credentials and its
   * meta and members spaces. Hidden, private, nsfw and archived groups get an
   * opaque `g-<6 base32>` handle; active groups a readable one. The profile
   * is not part of this: the caller writes it with updateProfile next.
   */
  createGroup(input: {
    slug: string;
    status: GroupStatus;
    ownerDid: DidString;
    /** the owner's did:key, offered at creation; shown once, never stored */
    ownerRecoveryKey?: string;
  }): Promise<{ did: DidString; handle: string }>;

  /**
   * A session that writes as the group (app password today): every repo and
   * space write and every simplespace management call. An Agent, so both the
   * stable Client and the spaces package can use it.
   */
  writer(groupDid: DidString): Promise<Agent>;

  /**
   * A full session, only for getDelegationToken (app passwords are refused
   * there), i.e. for the space syncer's reads and registerNotify.
   */
  syncSession(groupDid: DidString): Promise<Agent>;

  /**
   * Writes group.opensocial.profile/self and social.laundryroom.group.profile/self
   * into the meta space, and the public copy of the laundryroom profile only
   * when `publish` is true (active groups; access.ts decides).
   */
  updateProfile(input: {
    groupDid: DidString;
    profile: RecordFields<typeof NSID.laundryroomGroupProfile>;
    joinPolicy: JoinPolicy;
    publish: boolean;
  }): Promise<RecordRef[]>;

  /** Renames the group's handle (status changes swap readable and opaque). */
  setHandle(groupDid: DidString, handle: string): Promise<void>;

  /** Creates one of the group's spaces (simplespace createSpace). */
  createSpace(input: {
    groupDid: DidString;
    space: GroupSpaceName;
    read: SpacePolicy;
    write: SpacePolicy;
  }): Promise<SpaceRef>;

  /** Changes a space's policies, e.g. the meta read policy on a status change. */
  updateSpace(input: {
    space: SpaceRef;
    read?: SpacePolicy;
    write?: SpacePolicy;
  }): Promise<void>;

  /**
   * Adds or updates a member on a space's member list. laundryroom is the
   * only writer of member lists; group_member stays the authoritative
   * projection.
   */
  putMember(input: { space: SpaceRef } & SpaceMember): Promise<void>;

  /** Removes a member from a space's member list (leave, ban, role change). */
  removeMember(input: { space: SpaceRef; did: DidString }): Promise<void>;

  /** The member list as the space host has it, for the daily reconcile. */
  listMembers(space: SpaceRef): Promise<SpaceMember[]>;

  /**
   * Deletes a space (simplespace deleteSpace); the space host then sends
   * notifySpaceDeleted, and the index purges every copy.
   */
  deleteSpace(space: SpaceRef): Promise<void>;

  /** Deactivates the group account (after deleteSpace for every space). */
  deactivate(groupDid: DidString): Promise<void>;
}

// ---------------------------------------------------------------------------
// group content

/** The collections a GroupContentStore holds. */
export type GroupContentNsid = Exclude<
  RecordNsid,
  typeof NSID.actorProfile | typeof NSID.laundryroomGroupProfile
>;

/** The com.atproto.repo.strongRef fields of each GroupContentNsid. */
export type StrongRefKeys<C extends GroupContentNsid> =
  C extends typeof NSID.reply
    ? "thread" | "parent"
    : C extends
          | typeof NSID.eventInfo
          | typeof NSID.attendance
          | typeof NSID.pledgeBoard
      ? "event"
      : C extends typeof NSID.rsvp
        ? "subject"
        : C extends typeof NSID.pledgeItem
          ? "board"
          : C extends typeof NSID.pledgeFulfillment
            ? "item"
            : never;

type RefKeys<T, C extends GroupContentNsid> = Extract<
  StrongRefKeys<C>,
  keyof T
>;

/**
 * A record's fields with each strongRef field replaced by a ContentRef (its
 * optionality kept). This is what lets PostgresStore, whose rows reference
 * each other by id, share one interface with the record stores, which turn
 * the ContentRefs into strongRefs before buildRecord.
 */
export type ContentFields<C extends GroupContentNsid> = Omit<
  RecordFields<C>,
  RefKeys<RecordFields<C>, C>
> & {
  [P in keyof Pick<RecordFields<C>, RefKeys<RecordFields<C>, C>>]: ContentRef;
};

/** ContentFields of a stored item: lexicon defaults applied, no `$type`. */
export type StoredFields<C extends GroupContentNsid> = Omit<
  RecordValue<C>,
  "$type" | RefKeys<RecordValue<C>, C>
> & {
  [P in keyof Pick<RecordValue<C>, RefKeys<RecordValue<C>, C>>]: ContentRef;
};

/**
 * The member or group a write is made as. Members' own records (threads,
 * replies, rsvps, pledge fulfillments) are written as the member through
 * their oauth session, or kept as local records when the session has no
 * space scope for the group's space. Group records (events, event info,
 * attendance, pledge boards and items, labels) go through GroupHost.
 */
export type Actor =
  | {
      kind: "member";
      /** laundryroom user id (user.id) */
      userId: string;
      /** null for unlinked legacy users: their content stays in postgres */
      did: DidString | null;
      /**
       * the space types the member's oauth grant allows writing into
       * (ScopePermissions.allowsSpace, checked per type: the raw-scope
       * fallback requests forum and calendar separately). A write into a
       * space whose type is missing goes to local records.
       */
      grantedSpaceTypes: readonly SpaceType[];
    }
  | { kind: "group"; groupId: string; groupDid: DidString | null };

/**
 * What the caller already decided with access.ts before reading. Stores never
 * decide access themselves: there is one rule and one implementation (see
 * docs/atproto-plan.md, "read enforcement"). Stores do drop content by banned
 * members (group_ban), records labelled `!hide` unless includeHidden, and
 * hidden meetups unless canSeeHiddenMeetups.
 */
export interface ReadScope {
  /** group.id */
  groupId: string;
  /** owners, admins and moderators also see records labelled `!hide` */
  includeHidden: boolean;
  /**
   * access.ts canSeeHiddenMeetups(role): also return hidden meetups, i.e.
   * events in calendar/staff (and today's meetups with status hidden).
   * Without it a CalendarStore never reads calendar/staff.
   */
  canSeeHiddenMeetups: boolean;
}

export interface Page<T> {
  items: T[];
  cursor?: string;
}

export interface PageQuery {
  cursor?: string;
  limit: number;
}

/** A stored item of collection C. */
export interface Stored<C extends GroupContentNsid> {
  ref: ContentRef;
  /** the author's did; null for legacy postgres rows of unlinked users */
  authorDid: DidString | null;
  fields: StoredFields<C>;
  /** the record exactly as written; absent for postgres rows */
  record?: RecordValue<C>;
  indexedAt: DatetimeString;
}

/** Input of a create. Record stores validate with buildRecord first. */
export interface CreateInput<C extends GroupContentNsid> {
  as: Actor;
  fields: ContentFields<C>;
}

/** Input of an update of an existing item. */
export interface UpdateInput<C extends GroupContentNsid>
  extends CreateInput<C> {
  ref: ContentRef;
}

/** Input of a put: creates, or updates when `ref` is given. */
export interface PutInput<C extends GroupContentNsid> extends CreateInput<C> {
  ref?: ContentRef;
}

export interface DeleteInput {
  as: Actor;
  ref: ContentRef;
}

/** Threads and replies, in the group's forum space (phase 5). */
export interface ForumStore {
  createThread(
    input: CreateInput<typeof NSID.thread>,
  ): Promise<Stored<typeof NSID.thread>>;
  updateThread(
    input: UpdateInput<typeof NSID.thread>,
  ): Promise<Stored<typeof NSID.thread>>;
  deleteThread(input: DeleteInput): Promise<void>;
  getThread(
    scope: ReadScope,
    ref: ContentRef,
  ): Promise<Stored<typeof NSID.thread> | null>;
  listThreads(
    scope: ReadScope,
    page: PageQuery,
  ): Promise<Page<Stored<typeof NSID.thread>>>;

  createReply(
    input: CreateInput<typeof NSID.reply>,
  ): Promise<Stored<typeof NSID.reply>>;
  updateReply(
    input: UpdateInput<typeof NSID.reply>,
  ): Promise<Stored<typeof NSID.reply>>;
  deleteReply(input: DeleteInput): Promise<void>;
  listReplies(
    scope: ReadScope,
    thread: ContentRef,
    page: PageQuery,
  ): Promise<Page<Stored<typeof NSID.reply>>>;
}

/** An event together with its social.laundryroom.calendar.eventInfo. */
export interface StoredEvent {
  event: Stored<typeof NSID.event>;
  info: Stored<typeof NSID.eventInfo> | null;
}

/**
 * Meetups and rsvps, in the group's calendar spaces (phase 6): calendar/self,
 * or calendar/staff for hidden meetups (read only with
 * ReadScope.canSeeHiddenMeetups). Events are never deleted, only cancelled
 * (`status`), because strongRefs to them would orphan.
 */
export interface CalendarStore {
  /**
   * Creates or updates the event and its eventInfo (rkey = the event's).
   * `space` is fixed when the event is created: an update with a `ref` in
   * the other calendar space throws. Moving a meetup between hidden and
   * visible gives it a new uri and cid, so it is a separate operation that
   * also re-points what hangs off the event (eventInfo, pledge board and
   * items, rsvps, thread subjects); it is designed in phase 6.
   */
  putEvent(input: {
    as: Actor;
    ref?: ContentRef;
    space: Extract<GroupSpaceName, "calendar" | "staffCalendar">;
    event: ContentFields<typeof NSID.event>;
    info: Omit<ContentFields<typeof NSID.eventInfo>, "event">;
  }): Promise<StoredEvent>;
  getEvent(scope: ReadScope, ref: ContentRef): Promise<StoredEvent | null>;
  listEvents(
    scope: ReadScope,
    query: PageQuery & { from?: DatetimeString },
  ): Promise<Page<StoredEvent>>;

  /** One per member and event: the rsvp's rkey is the event's rkey. */
  putRsvp(
    input: CreateInput<typeof NSID.rsvp>,
  ): Promise<Stored<typeof NSID.rsvp>>;
  deleteRsvp(input: DeleteInput): Promise<void>;
  listRsvps(
    scope: ReadScope,
    event: ContentRef,
  ): Promise<Stored<typeof NSID.rsvp>[]>;

  /** The group's authoritative going/waitlist outcome (rkey = the event's). */
  putAttendance(
    input: CreateInput<typeof NSID.attendance>,
  ): Promise<Stored<typeof NSID.attendance>>;
}

/** A pledge board with its items and fulfillments. */
export interface StoredPledgeBoard {
  board: Stored<typeof NSID.pledgeBoard>;
  items: Stored<typeof NSID.pledgeItem>[];
  fulfillments: Stored<typeof NSID.pledgeFulfillment>[];
}

/** Pledge boards, items and fulfillments, in calendar/self (phase 6). */
export interface PledgeStore {
  /** At most one board per event: the board's rkey is the event's rkey. */
  putBoard(
    input: PutInput<typeof NSID.pledgeBoard>,
  ): Promise<Stored<typeof NSID.pledgeBoard>>;
  deleteBoard(input: DeleteInput): Promise<void>;
  getBoard(
    scope: ReadScope,
    event: ContentRef,
  ): Promise<StoredPledgeBoard | null>;
  putItem(
    input: PutInput<typeof NSID.pledgeItem>,
  ): Promise<Stored<typeof NSID.pledgeItem>>;
  deleteItem(input: DeleteInput): Promise<void>;
  /** One per member and item: the fulfillment's rkey is the item's rkey. */
  putFulfillment(
    input: CreateInput<typeof NSID.pledgeFulfillment>,
  ): Promise<Stored<typeof NSID.pledgeFulfillment>>;
  deleteFulfillment(input: DeleteInput): Promise<void>;
}

/**
 * A group.opensocial.label written by the group. Record labels live in the
 * labelled record's own space, account labels in members/self; never on a
 * public label stream. The shape follows the opensocial draft at
 * OPENSOCIAL_REV, whose lexicons are not part of the stable codegen.
 */
export interface GroupLabel {
  ref: ContentRef;
  subject: { did: DidString } | { record: ContentRef };
  val: (typeof LABEL_VAL)[keyof typeof LABEL_VAL];
  /** true negates an earlier label with the same subject and val */
  neg: boolean;
  /** at-uri of the group.opensocial.rule the label cites */
  rule?: AtUriString;
  createdAt: DatetimeString;
}

/** Moderation labels (phase 5 for the forum, phase 6 for the rest). */
export interface LabelStore {
  applyLabel(input: {
    as: Actor;
    subject: GroupLabel["subject"];
    val: GroupLabel["val"];
    rule?: AtUriString;
  }): Promise<GroupLabel>;
  negateLabel(input: { as: Actor; label: ContentRef }): Promise<GroupLabel>;
  listLabels(
    scope: ReadScope,
    subject: GroupLabel["subject"],
  ): Promise<GroupLabel[]>;
}

/**
 * Everything members-only a group holds. Three implementations, picked per
 * feature and per author in code (there is no environment switch):
 * - PostgresStore wraps today's tables until a feature moves;
 * - SpacesStore writes space records and reads the index;
 * - LocalRecordStore keeps local records for authors whose session has no
 *   space scope.
 * See docs/atproto-plan.md, "one interface, three stores" and "local records".
 */
export interface GroupContentStore
  extends ForumStore,
    CalendarStore,
    PledgeStore,
    LabelStore {
  readonly kind: "postgres" | "spaces" | "local";
}
