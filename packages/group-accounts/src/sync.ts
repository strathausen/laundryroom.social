import type { DidString } from "@atproto/lex";

import type { GroupAccount } from "@laundryroom/atproto";
import { groupProfileFields, publishesOnNetwork } from "@laundryroom/atproto";
import {
  and,
  asc,
  count,
  eq,
  gt,
  isNotNull,
  isNull,
  sql,
} from "@laundryroom/db";
import { db } from "@laundryroom/db/client";
import { Group, GroupCredential } from "@laundryroom/db/schema";

import type { GroupAccountsConfig } from "./config";
import { NetworkBudget } from "./budget";
import { CredentialCipher } from "./cipher";
import { groupAccountsConfig } from "./config";
import { DbGroupCredentialStore } from "./db-store";
import {
  describeError,
  GroupAccountError,
  isCredentialError,
  isPermanentGroupAccountError,
  redactInLogs,
} from "./errors";
import { loadGroupAvatar } from "./image";
import { LocalPdsGroupHost } from "./local-pds-group-host";
import { withGroupLock } from "./lock";

/**
 * What the worker's group.* jobs do, on top of LocalPdsGroupHost: bring a
 * group's account in line with its row. The rules are the plan's "no new
 * leaks": only a group that publishes on the network (active, moderation
 * ok, and active for a day) has a readable handle and a public profile;
 * every other one has an opaque handle and nothing else. Every function
 * holds the group's advisory lock and reads the row inside it, so a job
 * always acts on the current state, and re-running one is safe.
 */

/**
 * How long a group must have been active before it goes on the network
 * (readable handle, public profile): a new group is active from the start,
 * and its owner gets a day to make it private or hidden before anything
 * permanent happens. Also caps the readable handle swaps of a group that
 * flips between active and private at one a day.
 */
export const GROUP_PUBLISH_GRACE_SECONDS = 24 * 60 * 60;
/** A group's profile is written at most once a minute (bursts of edits). */
const PROFILE_MIN_INTERVAL_SECONDS = 60;
/** New accounts per hour, all groups together (the backfill makes 60). */
const NEW_ACCOUNTS_PER_HOUR = 60;
/**
 * Relay events per hour from this worker, well below the relay's 2,600 an
 * hour and 21,000 a day per host (800 × 24 = 19,200).
 */
const NETWORK_EVENTS_PER_HOUR = 800;
/** Firehose events of a new account (identity, account, first commit). */
const NEW_ACCOUNT_EVENTS = 3;
/**
 * A job stops (and is retried) after this long: below pg-boss's expiry (10
 * min), so an expired job is never retried while it still runs, and below
 * the lock's idle limit (15 min).
 */
const JOB_DEADLINE_MS = 8 * 60_000;

/** A job to run again later, for the same group. */
export interface FollowUp {
  job: "group.ensureAccount" | "group.syncProfile";
  afterSeconds: number;
  reason: string;
}

export type GroupAccountOutcome =
  | { kind: "skipped"; reason: string }
  /** nothing done now; `followUp` does it */
  | { kind: "deferred"; followUp: FollowUp }
  | {
      kind: "synced";
      did: DidString;
      handle: string;
      published: boolean;
      /** whether a profile record was written or deleted */
      profileChanged: boolean;
      /** a group in its grace day: the sync that publishes it */
      followUp?: FollowUp;
    }
  | { kind: "retired"; did: DidString | null; takenDown: boolean }
  /** a deleted group whose account could not be taken off the network */
  | { kind: "kept"; did: DidString | null; reason: string };

let cachedHost:
  | { config: GroupAccountsConfig; host: LocalPdsGroupHost }
  | undefined;
const budget = new NetworkBudget(NETWORK_EVENTS_PER_HOUR);

/** The process's host, built from the config on first use. */
export function groupHost(config: GroupAccountsConfig): LocalPdsGroupHost {
  if (cachedHost?.config !== config) {
    redactInLogs([config.adminPassword, config.rateLimitBypassKey]);
    cachedHost = {
      config,
      host: new LocalPdsGroupHost({
        pdsUrl: config.pdsUrl,
        handleDomain: config.handleDomain,
        emailDomain: config.emailDomain,
        adminPassword: config.adminPassword,
        rateLimitBypassKey: config.rateLimitBypassKey,
        plcUrl: config.plcUrl,
        store: new DbGroupCredentialStore(
          new CredentialCipher(config.credentialKeys),
        ),
      }),
    };
  }
  return cachedHost.host;
}

/** `sql` for "this group publishes on the network right now". */
const publishesNow = () => sql`(
  coalesce(${Group.status}, 'active') = 'active'
  and coalesce(${Group.moderationStatus}, 'ok') = 'ok'
  and (${Group.activeSince} is null
    or ${Group.activeSince} <= now() - interval '${sql.raw(String(GROUP_PUBLISH_GRACE_SECONDS))} seconds')
)`;

async function readGroup(groupId: string) {
  const [row] = await db
    .select({
      id: Group.id,
      name: Group.name,
      description: Group.description,
      location: Group.location,
      timeZone: Group.timeZone,
      image: Group.image,
      imageDescription: Group.imageDescription,
      status: Group.status,
      moderationStatus: Group.moderationStatus,
      did: Group.did,
      handle: Group.handle,
      // created_at is a timestamp without time zone, written with now() in
      // the server's TimeZone: read it as the instant it is, whatever that
      // zone (drizzle would read it as utc), so the public createdAt is
      // right
      createdAtEpoch: sql<number>`extract(epoch from (${Group.createdAt} at time zone current_setting('TimeZone')))::float8`,
      // seconds left of the grace day; null or <= 0 when past it
      graceLeftSeconds: sql<
        number | null
      >`extract(epoch from (${Group.activeSince} + interval '${sql.raw(String(GROUP_PUBLISH_GRACE_SECONDS))} seconds' - now()))::float8`,
      // seconds since the profile was last written; null while there is none
      sincePublishedSeconds: sql<
        number | null
      >`extract(epoch from (now() - ${Group.publishedAt}))::float8`,
    })
    .from(Group)
    .where(eq(Group.id, groupId));
  return row;
}

/** Whether the group has an account, or one being created. */
async function hasAccount(groupId: string): Promise<boolean | null> {
  const [row] = await db
    .select({ did: Group.did, credential: GroupCredential.groupId })
    .from(Group)
    .leftJoin(GroupCredential, eq(GroupCredential.groupId, Group.id))
    .where(eq(Group.id, groupId));
  if (!row) return null;
  return !!row.did || !!row.credential;
}

/**
 * Without a config the worker cannot reach any account. A group without
 * one is fine (nothing to do); a group with one must not be skipped, or its
 * change (such as going private) is lost: retry, so it lands once the
 * config is back (and the hourly reconcile catches what ran out of
 * retries).
 */
async function withoutConfig(groupId: string): Promise<GroupAccountOutcome> {
  if (await hasAccount(groupId)) {
    throw new GroupAccountError(
      `group accounts are not configured, but group ${groupId} has an account: retrying until they are`,
      { permanent: false },
    );
  }
  return { kind: "skipped", reason: "group accounts are not configured" };
}

const jobSignal = (lockSignal: AbortSignal, signal?: AbortSignal) =>
  AbortSignal.any([
    lockSignal,
    AbortSignal.timeout(JOB_DEADLINE_MS),
    ...(signal ? [signal] : []),
  ]);

/**
 * Makes the group's account match its row: creates it first when `create`
 * is set (otherwise a group without an account is left alone; the backfill
 * creates those), then the handle (readable or opaque) and the public
 * profile (written, or deleted). A group leaving "active" loses its profile
 * before its handle turns opaque. `signal` is the job's: aborted when
 * pg-boss takes the job away.
 */
export async function syncGroupAccount(
  groupId: string,
  { create, signal }: { create: boolean; signal?: AbortSignal },
): Promise<GroupAccountOutcome> {
  const config = groupAccountsConfig();
  if (!config) return withoutConfig(groupId);
  return withGroupLock(groupId, async (lockSignal) => {
    const abort = jobSignal(lockSignal, signal);
    const group = await readGroup(groupId);
    if (!group) return { kind: "skipped", reason: "the group is gone" };
    const host = groupHost(config).withSignal(abort);

    const graceLeft = group.graceLeftSeconds ?? 0;
    const inGrace = publishesOnNetwork(group) && graceLeft > 0;
    const publish = publishesOnNetwork(group) && !inGrace;
    const graceFollowUp = (job: FollowUp["job"]): FollowUp => ({
      job,
      afterSeconds: Math.ceil(graceLeft) + 5,
      reason: `active for less than a day, on the network in ${Math.ceil(graceLeft / 3600)} h`,
    });

    let did = group.did as DidString | null;
    if (!did) {
      if (!create) return { kind: "skipped", reason: "it has no account yet" };
      // a new group: nothing reaches the network before its grace day is
      // over, and then directly with the right handle
      if (inGrace) {
        return {
          kind: "deferred",
          followUp: graceFollowUp("group.ensureAccount"),
        };
      }
      const recent = await accountsCreatedInLastHour();
      if (recent >= NEW_ACCOUNTS_PER_HOUR || !budget.fits(NEW_ACCOUNT_EVENTS)) {
        return {
          kind: "deferred",
          followUp: {
            job: "group.ensureAccount",
            afterSeconds: Math.max(
              600,
              budget.secondsUntilFits(NEW_ACCOUNT_EVENTS),
            ),
            reason: `the network budget is spent (${recent} new accounts in the last hour)`,
          },
        };
      }
      budget.record(NEW_ACCOUNT_EVENTS);
      did = (
        await host.createGroupAccount({
          groupId,
          handle: publish
            ? { kind: "readable", name: group.name }
            : { kind: "opaque" },
        })
      ).did;
    }

    if (!publish) {
      // privacy first: never deferred, and loud when it fails for good
      try {
        const deleted = await host.deleteProfile(did);
        const handle = await host.updateHandle({
          groupDid: did,
          handle: { kind: "opaque" },
        });
        budget.record((deleted ? 1 : 0) + (handle !== group.handle ? 1 : 0));
        abort.throwIfAborted();
        if (group.sincePublishedSeconds !== null) {
          await db
            .update(Group)
            .set({ publishedAt: null })
            .where(eq(Group.id, groupId));
        }
        return {
          kind: "synced",
          did,
          handle,
          published: false,
          profileChanged: deleted,
          ...(inGrace ? { followUp: graceFollowUp("group.syncProfile") } : {}),
        };
      } catch (err) {
        if (!isPermanentGroupAccountError(err)) throw err;
        throw new GroupAccountError(
          `group ${groupId} must not be public on the network, but taking its profile or readable handle down failed: ${describeError(err)}`,
          { permanent: true, credential: isCredentialError(err), cause: err },
        );
      }
    }

    // putting something on the network: a group's profile at most once a
    // minute, and within the relay budget of all groups
    const since = group.sincePublishedSeconds;
    if (since !== null && since < PROFILE_MIN_INTERVAL_SECONDS) {
      return {
        kind: "deferred",
        followUp: {
          job: "group.syncProfile",
          afterSeconds: Math.ceil(PROFILE_MIN_INTERVAL_SECONDS - since) + 1,
          reason: "its profile was written moments ago",
        },
      };
    }
    if (!budget.fits(2)) {
      return {
        kind: "deferred",
        followUp: {
          job: "group.syncProfile",
          afterSeconds: budget.secondsUntilFits(2),
          reason: "the network budget is spent",
        },
      };
    }
    const handle = await host.updateHandle({
      groupDid: did,
      handle: { kind: "readable", name: group.name },
    });
    const avatar = await loadGroupAvatar(
      groupId,
      group.image,
      group.imageDescription,
      fetch,
      abort,
    );
    const { changed } = await host.updateProfile({
      groupDid: did,
      profile: groupProfileFields({
        ...group,
        createdAt: new Date(group.createdAtEpoch * 1000),
      }),
      avatar,
    });
    budget.record((changed ? 1 : 0) + (handle !== group.handle ? 1 : 0));
    abort.throwIfAborted();
    if (changed || since === null) {
      await db
        .update(Group)
        .set({ publishedAt: sql`now()` })
        .where(eq(Group.id, groupId));
    }
    return {
      kind: "synced",
      did,
      handle,
      published: true,
      profileChanged: changed,
    };
  });
}

/**
 * Deletes a group whose account has to go first (group.delete marks it
 * archived and enqueues this): deletes its public profile, deactivates the
 * account, then deletes the row (its credentials go with it). If the
 * account cannot be reached with its credential (lost, refused), it is
 * taken down with the pds admin password instead, so nothing of it stays
 * public; if even that fails for good, the row stays (archived, members
 * only) and the failure is logged, for the pds admin to look at.
 */
export async function retireGroupAccount(
  groupId: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<GroupAccountOutcome> {
  const config = groupAccountsConfig();
  if (!config) {
    const account = await hasAccount(groupId);
    if (account === null)
      return { kind: "skipped", reason: "the group is gone" };
    // keep the row (archived, members only) and its credentials until the
    // config is back
    if (account) await withoutConfig(groupId);
    await db.delete(Group).where(eq(Group.id, groupId));
    return { kind: "retired", did: null, takenDown: false };
  }
  return withGroupLock(groupId, async (lockSignal) => {
    const abort = jobSignal(lockSignal, signal);
    const group = await readGroup(groupId);
    if (!group) return { kind: "skipped", reason: "the group is gone" };
    const host = groupHost(config).withSignal(abort);
    let did = group.did as DidString | null;
    let takenDown = false;
    try {
      did ??= (await host.findGroupAccount(groupId))?.did ?? null;
      if (did) {
        if (await host.deleteProfile(did)) budget.record(1);
        await host.deactivate(did);
        budget.record(1);
      }
    } catch (err) {
      if (!isPermanentGroupAccountError(err)) throw err;
      if (!did) {
        return {
          kind: "kept",
          did,
          reason: `an account may have been created, but cannot be found (${describeError(err)})`,
        };
      }
      console.warn(
        `[group-accounts] retiring group ${groupId}: ${did} cannot be reached with its credential (${describeError(err)}); taking it down with the pds admin`,
      );
      try {
        await host.takeDown(did, `laundryroom:deleted-group:${groupId}`);
        budget.record(1);
        takenDown = true;
      } catch (takedownErr) {
        if (!isPermanentGroupAccountError(takedownErr)) throw takedownErr;
        return {
          kind: "kept",
          did,
          reason: `neither its credential nor the pds admin can take it down (${describeError(takedownErr)})`,
        };
      }
    }
    abort.throwIfAborted();
    await db.delete(Group).where(eq(Group.id, groupId));
    return { kind: "retired", did, takenDown };
  });
}

/**
 * Custody recovery of one group (apps/worker/src/recover-group-credential.ts):
 * a new master password set with the pds admin password, a new writer app
 * password, both stored encrypted. For a group whose credential is gone,
 * refused or no longer decrypts.
 */
export async function recoverGroupCredential(
  groupId: string,
): Promise<GroupAccount> {
  const config = groupAccountsConfig();
  if (!config) {
    throw new GroupAccountError("group accounts are not configured", {
      permanent: true,
    });
  }
  return withGroupLock(groupId, async (lockSignal) => {
    const group = await readGroup(groupId);
    if (!group) {
      throw new GroupAccountError(`there is no group ${groupId}`, {
        permanent: true,
      });
    }
    if (!group.did) {
      throw new GroupAccountError(
        `group ${groupId} has no account to recover (queue it with backfill-group-accounts --group instead)`,
        { permanent: true },
      );
    }
    return groupHost(config)
      .withSignal(jobSignal(lockSignal))
      .recoverAccount(groupId, group.did as DidString);
  });
}

async function accountsCreatedInLastHour(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(GroupCredential)
    .where(gt(GroupCredential.createdAt, sql`now() - interval '1 hour'`));
  return row?.count ?? 0;
}

/**
 * Groups with an account that have something on the network they must not
 * have (a readable handle or a profile, while not public): their sync
 * failed for good or ran out of retries, the config was off meanwhile, or
 * moderation changed them in the database. The hourly reconcile queues a
 * sync for each.
 */
export async function groupIdsToTakeDown(): Promise<string[]> {
  const rows = await db
    .select({ id: Group.id })
    .from(Group)
    .where(
      and(
        isNotNull(Group.did),
        sql`(${Group.handle} !~ '^g-[a-z2-7]{6}\\.' or ${Group.publishedAt} is not null)`,
        sql`not ${publishesNow()}`,
      ),
    )
    .orderBy(asc(Group.createdAt), asc(Group.id));
  return rows.map((row) => row.id);
}

/** Where the backfill continues: after this group, in creation order. */
export interface BackfillCursor {
  /** group.created_at as postgres prints it (no time zone conversion) */
  createdAt: string;
  id: string;
}

/**
 * The next groups without an account, oldest first (foodiespace is the
 * oldest), after `after`.
 */
export async function groupsWithoutAccount({
  after,
  limit,
}: {
  after?: BackfillCursor;
  limit: number;
}): Promise<BackfillCursor[]> {
  return db
    .select({
      createdAt: sql<string>`${Group.createdAt}::text`,
      id: Group.id,
    })
    .from(Group)
    .where(
      and(
        isNull(Group.did),
        after
          ? sql`(${Group.createdAt}, ${Group.id}) > (${after.createdAt}::timestamp, ${after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(asc(Group.createdAt), asc(Group.id))
    .limit(limit);
}

/** Every group with an account, oldest first (for a re-sync of all). */
export async function groupIdsWithAccount(): Promise<string[]> {
  const rows = await db
    .select({ id: Group.id })
    .from(Group)
    .where(isNotNull(Group.did))
    .orderBy(asc(Group.createdAt), asc(Group.id));
  return rows.map((row) => row.id);
}

/** How many groups have an account (the relay counts accounts per host). */
export async function countGroupAccounts(): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(Group)
    .where(isNotNull(Group.did));
  return row?.count ?? 0;
}
