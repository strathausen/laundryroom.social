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
