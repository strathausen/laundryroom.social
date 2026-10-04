import type { Queue, WorkOptions } from "pg-boss";
import { z } from "zod";

/** A value that survives the jobs table (pg-boss stores payloads as jsonb). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };
export type JsonObject = Record<string, JsonValue | undefined>;

/**
 * A payload schema whose input and output are both plain JSON objects.
 * `enqueue` stores the parsed output, and the worker parses that again after
 * the jsonb round trip, so a z.date(), z.bigint() or a transform into a
 * non-JSON value would fail every job (and the type rejects them). Parsing
 * must also be idempotent: no transform that changes an already parsed value.
 * Send dates as `z.string().datetime()`.
 */
export type PayloadSchema = z.ZodType<JsonObject, z.ZodTypeDef, JsonObject>;

/**
 * One entry per job type. The key is the pg-boss queue name (letters, digits,
 * `_`, `-`, `.` and `/`), so `email.send` style names work.
 */
export interface JobDefinition<TPayload extends PayloadSchema> {
  /**
   * Checked when a job is enqueued (a bad payload never reaches the table)
   * and again before the handler runs (a job enqueued by an older deploy may
   * not match any more). A job that fails the second check fails like any
   * other handler error, with the zod message as its output.
   *
   * After a deploy the previous worker keeps taking jobs for a while (see
   * the README, "Deploys and restarts"), so a change must stay readable by
   * both: add optional fields only, or use a new queue name.
   */
  payload: TPayload;
  /**
   * Queue options (retries, expiry, retention). The worker writes them on
   * every start, so this file is the source of truth: a value removed here
   * stays in the database, so set what matters explicitly. `policy` and
   * `partition` are fixed when the queue is created; changing either means a
   * new queue name. A job that must not be lost needs `retryLimit` >= 1 and
   * a `retryDelay` longer than the deploy overlap (usually 1-2 min; 300 s is
   * safe), so a job the outgoing worker fails is retried by the new one.
   */
  queue: Omit<Queue, "name">;
  /** How the worker fetches this queue. Leave unset for one job at a time. */
  work?: Pick<WorkOptions, "localConcurrency" | "pollingIntervalSeconds">;
}

const defineJob = <TPayload extends PayloadSchema>(
  definition: JobDefinition<TPayload>,
) => definition;

const DAY = 24 * 60 * 60;

/** The queue options of the group account jobs (see below). */
const groupAccountQueue: Omit<Queue, "name"> = {
  policy: "stately",
  // 1 min, 2, 4, ... capped at 1 h: about a day of pds or network trouble
  retryLimit: 30,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 60 * 60,
  // creating an account and uploading an avatar take seconds; a stuck call
  // times out after 30 s, so 10 min is only reached by something hung
  expireInSeconds: 10 * 60,
  deleteAfterSeconds: 14 * DAY,
  retentionSeconds: 14 * DAY,
};

/**
 * Every job the app knows. Adding an entry here makes the worker's typecheck
 * fail until apps/worker has a handler for it (`JobHandlers` is exhaustive),
 * and this package's until registry.test.ts has sample payloads for it.
 */
export const jobs = {
  // proves the worker is alive and that schedules fire: logs one line, every
  // 15 minutes from the cron in apps/worker and once per worker start
  heartbeat: defineJob({
    payload: z.object({ trigger: z.enum(["schedule", "startup"]) }),
    queue: {
      policy: "standard",
      // a missed heartbeat is not worth a retry, the next one is due soon
      retryLimit: 0,
      expireInSeconds: 60,
      deleteAfterSeconds: 2 * DAY,
      retentionSeconds: DAY,
    },
  }),

  // group accounts on pds.lndry.social (packages/group-accounts, phase 3 of
  // docs/atproto-plan.md). every write as a group happens in these jobs,
  // enqueued by trpc after its access check, never inline in a request.
  // "stately" with the group id as singletonKey: at most one queued and one
  // running job per group and queue (a burst of edits collapses into one
  // sync, which reads the row when it runs); the handlers also take a
  // per-group advisory lock, so jobs of different queues never overlap.
  // network trouble is retried with backoff for about a day; a permanent
  // failure (an invalid record, a refused credential) is logged loudly and
  // the job completes.

  // creates the group's account if it has none, then syncs handle and
  // profile. enqueued when a group is created, and by the backfill. a group
  // in its first day of being active gets its account once the day is over
  // (the job queues itself again, singletonKey `<group id>:later`)
  "group.ensureAccount": defineJob({
    payload: z.object({ groupId: z.string().uuid() }),
    queue: groupAccountQueue,
  }),
  // brings handle and public profile in line with the group row (an edit or
  // a status change). a group without an account is left alone. a group in
  // its first day of being active is synced again (singletonKey
  // `<group id>:later`, so it never blocks an immediate sync) once the day
  // is over
  "group.syncProfile": defineJob({
    payload: z.object({ groupId: z.string().uuid() }),
    queue: groupAccountQueue,
  }),
  // a deleted group with an account: deletes its public profile, deactivates
  // the account, then deletes the group row. group.delete archives the group
  // and enqueues this
  "group.retireAccount": defineJob({
    payload: z.object({ groupId: z.string().uuid() }),
    queue: groupAccountQueue,
  }),
  // hourly (cron in apps/worker): queues group.syncProfile for every group
  // that has something on the network it must not have (a readable handle
  // or a profile while not public), e.g. after a sync failed for good or
  // moderation changed a group in the database. a no-op while group
  // accounts are off
  "group.reconcileAccounts": defineJob({
    payload: z.object({ trigger: z.enum(["schedule", "manual"]) }),
    queue: {
      // at most one queued and one running
      policy: "stately",
      // the next hour's run tries again
      retryLimit: 0,
      expireInSeconds: 5 * 60,
      deleteAfterSeconds: 2 * DAY,
      retentionSeconds: DAY,
    },
  }),
  // one-off (README, "Group accounts"): enqueues group.ensureAccount for the
  // next `batchSize` groups without an account, `spacingSeconds` apart, then
  // itself for the next batch, until none are left. spaced far below the
  // relay's 2,600 events per hour and host
  "group.backfillAccounts": defineJob({
    payload: z.object({
      /** the last group of the previous batch (creation order) */
      after: z
        .object({ createdAt: z.string().min(1), id: z.string().uuid() })
        .optional(),
      batchSize: z.number().int().min(1).max(100).default(10),
      spacingSeconds: z.number().int().min(10).max(3600).default(60),
    }),
    queue: {
      policy: "stately",
      retryLimit: 5,
      retryDelay: 300,
      retryBackoff: true,
      expireInSeconds: 5 * 60,
      deleteAfterSeconds: 14 * DAY,
      retentionSeconds: 14 * DAY,
    },
  }),
};

export type JobName = keyof typeof jobs;
/** What callers pass to `enqueue` (before zod defaults and transforms). */
export type JobInput<N extends JobName> = z.input<(typeof jobs)[N]["payload"]>;
/** What handlers receive (after parsing). */
export type JobData<N extends JobName> = z.output<(typeof jobs)[N]["payload"]>;

export const jobNames = Object.keys(jobs) as JobName[];

export function parsePayload<N extends JobName>(
  name: N,
  data: unknown,
): JobData<N> {
  const result = jobs[name].payload.safeParse(data);
  if (!result.success) {
    throw new Error(`invalid payload for job ${name}: ${result.error.message}`);
  }
  return result.data;
}
