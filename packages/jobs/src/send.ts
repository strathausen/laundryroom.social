import type { ConnectionOptions, JobOptions } from "pg-boss";

import type { JobInput, JobName } from "./registry";
import { getBoss } from "./boss";
import { parsePayload } from "./registry";

/**
 * Per-job options. Retries, expiry and retention come from the queue (see
 * registry.ts) and are not overridable per job. `db` sends inside an existing
 * transaction (pg-boss ships adapters such as `fromDrizzle`), so the job only
 * exists if that transaction commits.
 */
export type EnqueueOptions = JobOptions & ConnectionOptions;

/**
 * Validates the payload and puts a job on its queue; the worker picks it up
 * within its polling interval (2 s by default). Resolves to the job id, or
 * null when a singleton/throttle option suppressed the job.
 *
 * @example await enqueue("heartbeat", { trigger: "startup" })
 */
export async function enqueue<N extends JobName>(
  name: N,
  data: JobInput<N>,
  options: EnqueueOptions = {},
): Promise<string | null> {
  const payload = parsePayload(name, data);
  const boss = await getBoss();
  return boss.send(name, payload, options);
}

/**
 * Like `enqueue`, but the job only becomes available at `at` (e.g. a reminder
 * the day before a meetup). Recurring schedules are declared in apps/worker
 * instead (see `syncSchedules`).
 */
export function enqueueAt<N extends JobName>(
  name: N,
  data: JobInput<N>,
  at: Date,
  options: Omit<EnqueueOptions, "startAfter"> = {},
): Promise<string | null> {
  return enqueue(name, data, { ...options, startAfter: at });
}
