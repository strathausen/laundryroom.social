import type { PgBoss } from "pg-boss";

import type { JobData, JobInput, JobName } from "./registry";
import { jobNames, jobs, parsePayload } from "./registry";

export interface JobContext {
  id: string;
  name: JobName;
  /** 0 on the first attempt */
  retryCount: number;
  /**
   * Aborted when the job is taken away from this worker: a graceful stop ran
   * out of time, or the job expired. Pass it to fetch() and friends.
   */
  signal: AbortSignal;
}

/** Resolve to complete the job; throw to fail it (and retry per its queue). */
export type JobHandler<N extends JobName> = (
  data: JobData<N>,
  context: JobContext,
) => Promise<void>;

/** One handler per registry entry; a missing one is a type error. */
export type JobHandlers = { [N in JobName]: JobHandler<N> };

/** Starts polling every queue in the registry with its handler. */
export async function registerHandlers(
  boss: PgBoss,
  handlers: JobHandlers,
): Promise<void> {
  for (const name of jobNames) {
    await registerHandler(boss, name, handlers);
  }
}

async function registerHandler<N extends JobName>(
  boss: PgBoss,
  name: N,
  handlers: JobHandlers,
): Promise<void> {
  const handler: JobHandler<N> = handlers[name];
  await boss.work<unknown>(name, { ...jobs[name].work }, async (batch) => {
    for (const job of batch) {
      try {
        await handler(parsePayload(name, job.data), {
          id: job.id,
          name,
          retryCount: job.retryCount,
          signal: job.signal,
        });
      } catch (error) {
        console.error(
          `[jobs] ${name} ${job.id} failed (attempt ${job.retryCount + 1})`,
          error,
        );
        throw error;
      }
    }
  });
}

/** A recurring job: cron (5 fields, minute resolution) or an RRULE. */
export type ScheduleSpec = {
  [N in JobName]: {
    name: N;
    cron: string;
    data: JobInput<N>;
    /** IANA zone the expression is read in. Defaults to UTC. */
    tz?: string;
    /** Distinguishes several schedules of the same job. */
    key?: string;
  };
}[JobName];

/**
 * Makes the stored schedules match `specs` exactly: each one is created or
 * updated, and any other schedule in the database is removed, so deleting a
 * line in apps/worker also stops that cron. Schedules live in postgres and
 * only an instance with `schedule: true` (the worker) turns them into jobs,
 * so nothing fires while no worker runs, and occurrences missed meanwhile are
 * skipped.
 */
export async function syncSchedules(
  boss: PgBoss,
  specs: readonly ScheduleSpec[],
): Promise<void> {
  const wanted = new Set<string>();
  for (const spec of specs) {
    const key = spec.key ?? "";
    await boss.schedule(
      spec.name,
      spec.cron,
      parsePayload(spec.name, spec.data),
      {
        tz: spec.tz ?? "UTC",
        key,
      },
    );
    wanted.add(scheduleId(spec.name, key));
  }
  for (const stored of await boss.getSchedules()) {
    if (wanted.has(scheduleId(stored.name, stored.key))) continue;
    await boss.unschedule(stored.name, stored.key);
    console.log(
      `[jobs] removed schedule ${stored.name}${stored.key ? ` (${stored.key})` : ""}: not declared any more`,
    );
  }
}

const scheduleId = (name: string, key: string) => `${name}\u0000${key}`;
