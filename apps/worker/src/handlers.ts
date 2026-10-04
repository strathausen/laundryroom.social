import type { JobHandlers, ScheduleSpec } from "@laundryroom/jobs";

import { env } from "./env";

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
];
