import type {
  FollowUp,
  GroupAccountOutcome,
} from "@laundryroom/group-accounts/worker";
import type { JobHandlers, ScheduleSpec } from "@laundryroom/jobs";
import {
  countGroupAccounts,
  describeError,
  groupAccountsConfig,
  groupIdsToTakeDown,
  groupsWithoutAccount,
  isCredentialError,
  isPermanentGroupAccountError,
  retireGroupAccount,
  sanitizedError,
  syncGroupAccount,
} from "@laundryroom/group-accounts/worker";
import { enqueue } from "@laundryroom/jobs";

import { env } from "./env";

/**
 * The bsky.network relay takes 100 accounts per new pds host and throttles
 * the rest; warn well before (docs/atproto-plan.md, "ops prerequisites").
 */
const RELAY_ACCOUNT_WARNING = 80;

/** One log line per outcome: dids and handles are public, nothing else. */
function describeOutcome(outcome: GroupAccountOutcome): string {
  switch (outcome.kind) {
    case "skipped":
      return `skipped, ${outcome.reason}`;
    case "deferred":
      return `later (in ${outcome.followUp.afterSeconds}s): ${outcome.followUp.reason}`;
    case "retired":
      return `retired ${outcome.did ?? "(no account)"}${outcome.takenDown ? " (taken down by the pds admin)" : ""}, group deleted`;
    case "kept":
      return `NOT retired, the group stays archived: ${outcome.reason}`;
    case "synced":
      return `${outcome.did} @${outcome.handle}, ${
        outcome.published
          ? `public, profile ${outcome.profileChanged ? "written" : "unchanged"}`
          : `not public, ${outcome.profileChanged ? "profile deleted" : "nothing published"}`
      }${outcome.followUp ? `; ${outcome.followUp.reason}` : ""}`;
  }
}

/** What to do about a group job that gave up, for the log line. */
function nextStep(err: unknown, groupId: string): string {
  return isCredentialError(err)
    ? `its credential is lost, refused or does not decrypt: recover it with recover-group-credential --group ${groupId} (README, "Group accounts")`
    : `fix the cause, then queue it again with backfill-group-accounts --group ${groupId}`;
}

/** Queues `followUp` for the group, without blocking its immediate jobs. */
async function schedule(groupId: string, followUp: FollowUp): Promise<void> {
  await enqueue(
    followUp.job,
    { groupId },
    {
      // apart from the group's immediate jobs (keyed by the bare id), so a
      // waiting one never holds back a status change
      singletonKey: `${groupId}:later`,
      startAfter: Math.max(1, Math.ceil(followUp.afterSeconds)),
    },
  );
}

/**
 * Runs one group account job. Throwing makes pg-boss retry with backoff
 * (network trouble, the pds or the database briefly away); a failure that
 * cannot fix itself (an invalid record, a refused credential, a request the
 * pds calls invalid) is logged loudly instead and the job completes. Only
 * describeError's line is ever logged or stored: errors from the database
 * carry their query parameters (encrypted credentials among them).
 */
async function runGroupJob(
  name: string,
  groupId: string,
  jobId: string,
  run: () => Promise<GroupAccountOutcome>,
): Promise<void> {
  let outcome: GroupAccountOutcome;
  try {
    outcome = await run();
  } catch (err) {
    if (!isPermanentGroupAccountError(err)) throw sanitizedError(err);
    console.error(
      `[worker] ${name} ${groupId} job=${jobId}: GIVING UP, retrying will not help: ${describeError(err)}. ${nextStep(err, groupId)}. a group that is still public while it must not be is tried again by the hourly reconcile`,
    );
    return;
  }
  const line = `[worker] ${name} ${groupId} job=${jobId}: ${describeOutcome(outcome)}`;
  if (outcome.kind === "kept") console.error(line);
  else console.log(line);
  const followUp =
    outcome.kind === "deferred" || outcome.kind === "synced"
      ? outcome.followUp
      : undefined;
  if (followUp) await schedule(groupId, followUp);
}

/**
 * One handler per job in packages/jobs/src/registry.ts; the type makes a
 * missing one a compile error. Keep handlers idempotent: a job can run more
 * than once (retries, or a worker that died after the work but before pg-boss
 * recorded the completion).
 */
export const handlers: JobHandlers = {
  heartbeat: (data, { id }) => {
    const { rss } = process.memoryUsage();
    console.log(
      `[worker] heartbeat (${data.trigger}) job=${id} uptime=${Math.round(process.uptime())}s rss=${Math.round(rss / 1024 / 1024)}mb`,
    );
    return Promise.resolve();
  },

  "group.ensureAccount": ({ groupId }, { id, name, signal }) =>
    runGroupJob(name, groupId, id, () =>
      syncGroupAccount(groupId, { create: true, signal }),
    ),

  "group.syncProfile": ({ groupId }, { id, name, signal }) =>
    runGroupJob(name, groupId, id, () =>
      syncGroupAccount(groupId, { create: false, signal }),
    ),

  "group.retireAccount": ({ groupId }, { id, name, signal }) =>
    runGroupJob(name, groupId, id, () =>
      retireGroupAccount(groupId, { signal }),
    ),

  "group.reconcileAccounts": async (data, { id }) => {
    if (!groupAccountsConfig()) return;
    try {
      const ids = await groupIdsToTakeDown();
      let queued = 0;
      for (const groupId of ids) {
        const job = await enqueue(
          "group.syncProfile",
          { groupId },
          { singletonKey: groupId },
        );
        if (job) queued++;
      }
      if (ids.length > 0) {
        console.warn(
          `[worker] group.reconcileAccounts (${data.trigger}) job=${id}: ${ids.length} groups have something on the network they must not have (${ids.join(", ")}); queued ${queued} syncs`,
        );
      }
    } catch (err) {
      throw sanitizedError(err);
    }
  },

  "group.backfillAccounts": async (data, { id }) => {
    if (!groupAccountsConfig()) {
      console.log(
        `[worker] group.backfillAccounts job=${id}: skipped, group accounts are not configured`,
      );
      return;
    }
    const { after, batchSize, spacingSeconds } = data;
    const groups = await groupsWithoutAccount({ after, limit: batchSize });
    const start = Date.now();
    // spaced out: each new account is a few firehose events (identity,
    // account, the first commit, the profile), and the relay takes 2,600 an
    // hour per host. stately + the group id: a group already queued is not
    // queued twice, also when this job is retried
    for (const [index, group] of groups.entries()) {
      await enqueue(
        "group.ensureAccount",
        { groupId: group.id },
        {
          singletonKey: group.id,
          startAfter: new Date(start + index * spacingSeconds * 1000),
        },
      );
    }

    const accounts = await countGroupAccounts();
    if (accounts + groups.length >= RELAY_ACCOUNT_WARNING) {
      console.warn(
        `[worker] group.backfillAccounts: ${accounts} group accounts exist and ${groups.length} more are queued. the relay takes 100 per pds host: ask bluesky to raise the limit for the group pds`,
      );
    }

    const last = groups.at(-1);
    if (last && groups.length === batchSize) {
      await enqueue(
        "group.backfillAccounts",
        { after: last, batchSize, spacingSeconds },
        {
          singletonKey: "backfill",
          startAfter: new Date(start + groups.length * spacingSeconds * 1000),
        },
      );
      console.log(
        `[worker] group.backfillAccounts job=${id}: queued ${groups.length} groups, the next batch in ${Math.ceil((groups.length * spacingSeconds) / 60)} min`,
      );
    } else {
      console.log(
        `[worker] group.backfillAccounts job=${id}: ${
          groups.length > 0
            ? `queued the last ${groups.length} groups`
            : "no group left"
        }; the backfill is done once the queued groups ran`,
      );
    }
  },
};

/**
 * Every recurring job. syncSchedules makes the database match this list on
 * each start, so removing an entry here also removes its cron.
 */
export const schedules: ScheduleSpec[] = [
  {
    name: "heartbeat",
    cron: env.WORKER_HEARTBEAT_CRON,
    data: { trigger: "schedule" },
  },
  {
    // a few minutes past the hour, away from the heartbeat
    name: "group.reconcileAccounts",
    cron: "7 * * * *",
    data: { trigger: "schedule" },
  },
];
