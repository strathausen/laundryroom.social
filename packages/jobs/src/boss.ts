import type { ConstructorOptions } from "pg-boss";
import { PgBoss } from "pg-boss";

import { jobNames, jobs } from "./registry";

/**
 * Which process the instance lives in. Both share one postgres schema
 * (`pgboss`) and either can install or migrate it, whichever starts first
 * (pg-boss serialises that with an advisory lock).
 */
export type BossRole = "web" | "worker";

// eslint-disable-next-line no-restricted-properties
const connectionString = process.env.POSTGRES_URL;
// Same rule as packages/db/src/client.ts: `next build` and the docker image
// build run without a database (SKIP_ENV_VALIDATION=1), and nothing here opens
// a connection before the first getBoss() call, so an unset url is inert there
// and still fails loudly at runtime, where the switch is never set.
// eslint-disable-next-line no-restricted-properties
if (!connectionString && !process.env.SKIP_ENV_VALIDATION) {
  throw new Error("Missing POSTGRES_URL");
}

// Connection budget on dokku postgres (100): the web app's drizzle pool (10)
// and lock pool (4), plus these. pg-boss opens its own pool in start(), never
// earlier. `useListenNotify` stays off: it would hold one more connection,
// outside `max`.
const roleOptions: Record<BossRole, ConstructorOptions> = {
  // The web app only sends. No maintenance or cron timers and no row in the
  // instance registry, so an idle web container issues almost no queries.
  web: {
    max: 2,
    supervise: false,
    schedule: false,
    registerInstance: false,
  },
  // The worker also runs maintenance (expiry, retention, retries) and fires
  // the cron schedules.
  worker: {
    max: 3,
    instanceName: "worker",
    // Bounds a start against an unreachable database: start() waits out this
    // timeout twice (a best-effort `SELECT version()`, then the schema check)
    // before it fails, so a bad start exits within ~10 s, well inside the
    // 20 s uptime check in app.json. pg-boss's default is 10 s.
    connectionTimeoutMillis: 5_000,
  },
};

interface BossEntry {
  role: BossRole;
  boss: PgBoss;
  ready: Promise<PgBoss>;
  /** Set by stopBoss. The entry stays registered until the stop finished. */
  stopping?: Promise<void>;
}

// On globalThis so Next.js dev HMR reuses the instance instead of opening a
// new pool (and new timers) on every module reload.
const globalForJobs = globalThis as unknown as {
  laundryroomJobs: BossEntry | undefined;
};

/**
 * The process-wide pg-boss instance, started on first use. The worker calls
 * `getBoss("worker")` once at boot; everything else (the web app, `enqueue`
 * inside a handler) calls `getBoss()` and gets whatever instance this process
 * already has, or a send-only "web" one. A failed start is not cached, so the
 * next call tries again. While stopBoss runs, this returns the stopping
 * instance, never a new one: handlers still draining can enqueue (pg-boss
 * sends until its pool closes), and later sends fail instead of opening a
 * second pool.
 */
export function getBoss(role?: BossRole): Promise<PgBoss> {
  const current = globalForJobs.laundryroomJobs;
  if (current) {
    if (role && role !== current.role) {
      return Promise.reject(
        new Error(
          `pg-boss already started as "${current.role}", cannot start as "${role}"`,
        ),
      );
    }
    return current.ready;
  }
  if (!connectionString) {
    return Promise.reject(new Error("Missing POSTGRES_URL"));
  }

  const resolvedRole = role ?? "web";
  const boss = new PgBoss({
    connectionString,
    ...roleOptions[resolvedRole],
  });
  // pg-boss is an EventEmitter: an `error` without a listener would throw and
  // take the process down. These are background errors (a poll or maintenance
  // query that failed, e.g. while postgres restarts); pg-boss retries them.
  boss.on("error", (error) => {
    console.error(`[jobs] pg-boss error (${resolvedRole})`, error);
  });
  boss.on("warning", (warning) => {
    console.warn(`[jobs] pg-boss warning (${resolvedRole})`, warning.message);
  });

  const ready = (async () => {
    await boss.start();
    await ensureQueues(boss, resolvedRole === "worker");
    return boss;
  })();
  const entry: BossEntry = { role: resolvedRole, boss, ready };
  globalForJobs.laundryroomJobs = entry;
  ready.catch(async () => {
    if (globalForJobs.laundryroomJobs === entry) {
      globalForJobs.laundryroomJobs = undefined;
    }
    // close whatever the failed start opened (pool, timers)
    await boss.stop({ graceful: false }).catch(() => undefined);
  });
  return ready;
}

/**
 * Stops the instance of this process, if there is one. Graceful: no new jobs
 * are fetched, running handlers get up to `timeoutMs` to finish, whatever is
 * still running after that is failed (so it is retried per its queue's
 * retryLimit) and its AbortSignal fires; then the pool is closed. The
 * instance stays registered until then (see getBoss). A call while a stop is
 * already running waits for that stop, whose options apply.
 */
export function stopBoss({
  graceful = true,
  timeoutMs = 20_000,
}: { graceful?: boolean; timeoutMs?: number } = {}): Promise<void> {
  const entry = globalForJobs.laundryroomJobs;
  if (!entry) return Promise.resolve();
  entry.stopping ??= (async () => {
    try {
      await entry.ready.catch(() => undefined);
      await entry.boss.stop({ graceful, timeout: timeoutMs, close: true });
    } finally {
      if (globalForJobs.laundryroomJobs === entry) {
        globalForJobs.laundryroomJobs = undefined;
      }
    }
  })();
  return entry.stopping;
}

/**
 * pg-boss refuses to send to (or work on) a queue that does not exist, so
 * every instance creates the registry's queues when it starts; that is a
 * no-op for existing ones. The worker also writes the registry's options onto
 * existing queues, so a changed retry or retention setting applies on the
 * next deploy.
 */
async function ensureQueues(boss: PgBoss, update: boolean): Promise<void> {
  for (const name of jobNames) {
    const { queue } = jobs[name];
    await boss.createQueue(name, queue);
    if (!update) continue;

    const existing = await boss.getQueue(name);
    const wantedPolicy = queue.policy ?? "standard";
    if (existing && existing.policy !== wantedPolicy) {
      console.warn(
        `[jobs] queue ${name} has policy "${existing.policy}", the registry says "${wantedPolicy}". a policy cannot change; use a new queue name`,
      );
    }
    const { policy: _policy, partition: _partition, ...mutable } = queue;
    if (Object.keys(mutable).length > 0) {
      await boss.updateQueue(name, mutable);
    }
  }
}
