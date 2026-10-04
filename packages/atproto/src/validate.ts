/**
 * Local lexicon validation for every record laundryroom writes or ingests.
 *
 * The reference pds does not validate custom lexicons: it stores
 * social.laundryroom.* records with `validationStatus: 'unknown'`, and
 * `validate: true` fails with "unknown lexicon type". Spaces and local
 * records are not validated by anyone else either. So every write (public
 * repo, space or local record) goes through parseRecord or buildRecord first,
 * and ingest runs parseRecord again. See docs/atproto-plan.md, "lexicons we
 * publish" and "local records".
 *
 * Records in spaces point at other space records (a reply at its thread, an
 * rsvp at the canonical event), and the stable @atproto/syntax rejects space
 * uris as at-uris. Validating those needs the `isSpaceUri` option, which the
 * alpha-only spaces package provides.
 *
 * Values use the lex data model (Cid objects, BlobRef with a Cid `ref`).
 * Convert JSON from the wire with `jsonToLex` from @atproto/lex first.
 *
 * Backfills of today's rows must fit the lexicon limits first: several are
 * tighter than the database (names and pronouns 64 graphemes vs 255
 * characters, bios 2000 graphemes and comments 3000 vs unbounded, at most 10
 * links, each an absolute uri). Truncate by graphemes and normalise links in
 * the phase 2, 5 and 6 backfills; a record that does not fit throws here.
 */
import type {
  InferInput,
  InferOutput,
  Issue,
  RecordSchema,
} from "@atproto/lex";
import {
  IssueInvalidFormat,
  IssueInvalidType,
  IssueInvalidValue,
  IssueRequiredKey,
  IssueTooBig,
  IssueTooSmall,
} from "@atproto/lex";

import type { RecordNsid } from "./nsid";
import { community, social } from "./lexicons";
import { NSID, RECORD_NSIDS } from "./nsid";

/** The generated record schema of every collection in RECORD_NSIDS. */
export const RECORD_SCHEMAS = {
  [NSID.event]: community.lexicon.calendar.event.main,
  [NSID.rsvp]: community.lexicon.calendar.rsvp.main,
  [NSID.actorProfile]: social.laundryroom.actor.profile.main,
  [NSID.laundryroomGroupProfile]: social.laundryroom.group.profile.main,
  [NSID.eventInfo]: social.laundryroom.calendar.eventInfo.main,
  [NSID.attendance]: social.laundryroom.calendar.attendance.main,
  [NSID.pledgeBoard]: social.laundryroom.pledge.board.main,
  [NSID.pledgeItem]: social.laundryroom.pledge.item.main,
  [NSID.pledgeFulfillment]: social.laundryroom.pledge.fulfillment.main,
  [NSID.thread]: social.laundryroom.forum.thread.main,
  [NSID.reply]: social.laundryroom.forum.reply.main,
} as const satisfies Record<RecordNsid, RecordSchema>;

export type RecordSchemaOf<C extends RecordNsid> = (typeof RECORD_SCHEMAS)[C];

/**
 * The at-uri fields of every collection, as dotted paths: the `uri` of each
 * com.atproto.repo.strongRef and each `format: at-uri` string. Only these
 * may hold a space uri (see ParseRecordOptions.isSpaceUri). nsid.test.ts
 * checks the list against the lexicons.
 */
export const AT_URI_FIELDS = {
  [NSID.event]: [],
  [NSID.rsvp]: ["subject.uri"],
  [NSID.actorProfile]: [],
  [NSID.laundryroomGroupProfile]: [],
  [NSID.eventInfo]: ["event.uri"],
  [NSID.attendance]: ["event.uri"],
  [NSID.pledgeBoard]: ["event.uri"],
  [NSID.pledgeItem]: ["board.uri"],
  [NSID.pledgeFulfillment]: ["item.uri"],
  [NSID.thread]: ["subject"],
  [NSID.reply]: ["thread.uri", "parent.uri"],
} as const satisfies Record<RecordNsid, readonly string[]>;

/** A validated record of collection C, `$type` included, defaults applied. */
export type RecordValue<C extends RecordNsid> = InferOutput<RecordSchemaOf<C>>;

/** The fields of a record of collection C, without `$type` (buildRecord input). */
export type RecordFields<C extends RecordNsid> = Omit<
  InferInput<RecordSchemaOf<C>>,
  "$type"
>;

export function isRecordNsid(collection: string): collection is RecordNsid {
  return (RECORD_NSIDS as readonly string[]).includes(collection);
}

/**
 * One validation problem, described without the offending value: record
 * values of space content and local records must never reach a log (see
 * docs/atproto-plan.md, "no new leaks").
 */
export interface RecordIssue {
  code: string;
  /** json path, e.g. `$.subject.uri` or `$.going[3]` */
  path: string;
  /** what was expected, from the lexicon (never from the input) */
  expected?: string;
}

/**
 * A record that does not match its lexicon, or an rkey that does not match
 * the lexicon's key type. The message names the collection, codes and paths
 * only. The underlying LexValidationError is deliberately not attached as
 * `cause`, because its messages can quote the input.
 */
export class RecordValidationError extends Error {
  override readonly name = "RecordValidationError";

  constructor(
    readonly collection: string,
    readonly issues: readonly RecordIssue[],
  ) {
    super(
      `invalid ${collection} record: ${issues.map(formatIssue).join("; ")}`,
    );
  }
}

export interface ParseRecordOptions {
  /**
   * The rkey the record is (or will be) stored under. When given, it is
   * checked against the lexicon's key type (tid, any, literal:self).
   */
  rkey?: string;
  /**
   * false relaxes datetime formats and blob mime type and size checks, for
   * ingesting records other apps wrote. Never pass false before a write.
   * Defaults to true.
   */
  strict?: boolean;
  /**
   * Recognises the uri of a record in a space
   * (`at://<authority>/space/<type>/<skey>/<repo>/<collection>/<rkey>`
   * today, maybe `ats://` at ga), which the stable @atproto/syntax rejects.
   * It comes from the alpha-only spaces package, the only code that knows
   * the scheme. A string it accepts in one of the collection's
   * AT_URI_FIELDS passes as an at-uri; everything else is validated as
   * usual, and the record comes back with the space uri unchanged.
   */
  isSpaceUri?: (uri: string) => boolean;
}

export type SafeParseRecordResult<C extends RecordNsid> =
  | { success: true; value: RecordValue<C> }
  | { success: false; error: RecordValidationError };

/**
 * Validates a record value against the lexicon of `collection` and returns
 * it with lexicon defaults applied (write the returned value, not the
 * input). The value must carry the matching `$type`. Never throws, also not
 * for a collection outside RECORD_NSIDS (an unchecked cast on ingest).
 */
export function safeParseRecord<C extends RecordNsid>(
  collection: C,
  value: unknown,
  options: ParseRecordOptions = {},
): SafeParseRecordResult<C> {
  if (!isRecordNsid(collection)) {
    return {
      success: false,
      error: new RecordValidationError(collection, [
        { code: "unknown_collection", path: "collection" },
      ]),
    };
  }
  // every entry satisfies RecordSchema (checked above); indexing the map
  // with a generic key gives a union TypeScript cannot call directly
  const schema: RecordSchema = RECORD_SCHEMAS[collection];
  const issues: RecordIssue[] = [];

  if (options.rkey !== undefined) {
    const key = schema.keySchema.safeParse(options.rkey);
    if (!key.success) {
      issues.push({ code: "invalid_rkey", path: "rkey", expected: schema.key });
    }
  }

  const spaceUris = options.isSpaceUri
    ? findSpaceUris(value, AT_URI_FIELDS[collection], options.isSpaceUri)
    : [];
  const input = spaceUris.reduce<unknown>(
    (out, { path }) => withPath(out, path, SPACE_URI_STAND_IN),
    value,
  );

  const result = schema.safeParse(input, { strict: options.strict ?? true });
  if (!result.success) issues.push(...result.reason.issues.map(toRecordIssue));

  if (issues.length > 0 || !result.success) {
    return {
      success: false,
      error: new RecordValidationError(collection, issues),
    };
  }
  const parsed = spaceUris.reduce<unknown>(
    (out, { path, uri }) => withPath(out, path, uri),
    result.value,
  );
  return { success: true, value: parsed as RecordValue<C> };
}

/**
 * Like safeParseRecord, but throws a RecordValidationError. Run it before
 * every createRecord / putRecord / applyWrites (repo or space) and before
 * storing a local record, and again on ingest.
 */
export function parseRecord<C extends RecordNsid>(
  collection: C,
  value: unknown,
  options?: ParseRecordOptions,
): RecordValue<C> {
  const result = safeParseRecord(collection, value, options);
  if (!result.success) throw result.error;
  return result.value;
}

/**
 * Adds `$type` to `fields` and validates the result (always strict). Throws
 * a RecordValidationError.
 */
export function buildRecord<C extends RecordNsid>(
  collection: C,
  fields: RecordFields<C>,
  options?: Pick<ParseRecordOptions, "rkey" | "isSpaceUri">,
): RecordValue<C> {
  return parseRecord(
    collection,
    { ...fields, $type: collection },
    { ...options, strict: true },
  );
}

/** A valid at-uri that stands in for a space uri while the lexicon checks run. */
const SPACE_URI_STAND_IN = "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";

/** The space uris in `paths` of `value`, as `isSpaceUri` recognises them. */
function findSpaceUris(
  value: unknown,
  paths: readonly string[],
  isSpaceUri: (uri: string) => boolean,
): { path: string[]; uri: string }[] {
  const found: { path: string[]; uri: string }[] = [];
  for (const dotted of paths) {
    const path = dotted.split(".");
    let at = value;
    for (const key of path) at = isObject(at) ? at[key] : undefined;
    if (typeof at === "string" && isSpaceUri(at)) found.push({ path, uri: at });
  }
  return found;
}

/**
 * A copy of `value` with the field at `path` set to `next`. Only the objects
 * along the path are copied; nothing is mutated.
 */
function withPath(
  value: unknown,
  path: readonly string[],
  next: unknown,
): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return next;
  const object: Record<string, unknown> = isObject(value) ? value : {};
  return { ...object, [key]: withPath(object[key], rest, next) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecordIssue(issue: Issue): RecordIssue {
  const path = formatPath(issue.path);
  if (issue instanceof IssueRequiredKey) {
    return {
      code: issue.code,
      path: formatPath([...issue.path, issue.key]),
      expected: "a value",
    };
  }
  if (issue instanceof IssueInvalidFormat) {
    return { code: issue.code, path, expected: issue.format };
  }
  if (issue instanceof IssueInvalidType) {
    return { code: issue.code, path, expected: issue.expected.join(" | ") };
  }
  if (issue instanceof IssueInvalidValue) {
    // the allowed values come from the lexicon (consts, enums, $type)
    return {
      code: issue.code,
      path,
      expected: issue.values.map((v) => JSON.stringify(v)).join(" | "),
    };
  }
  if (issue instanceof IssueTooBig) {
    return {
      code: issue.code,
      path,
      expected: `${issue.type} <= ${issue.maximum}`,
    };
  }
  if (issue instanceof IssueTooSmall) {
    return {
      code: issue.code,
      path,
      expected: `${issue.type} >= ${issue.minimum}`,
    };
  }
  return { code: issue.code, path };
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (out, key) =>
      typeof key === "number" ? `${out}[${key}]` : `${out}.${String(key)}`,
    "$",
  );
}

function formatIssue(issue: RecordIssue): string {
  return issue.expected === undefined
    ? `${issue.code} at ${issue.path}`
    : `${issue.code} at ${issue.path} (expected ${issue.expected})`;
}
