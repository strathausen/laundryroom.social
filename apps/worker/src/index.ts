// The long-running worker process: pg-boss consumers and cron schedules.
// esbuild bundles it, dependencies included, into dist/index.mjs, which the
// Procfile's `worker:` line runs. See docs/atproto-plan.md, "the appview".

// First, so the env check runs before any other module is evaluated (a
// missing POSTGRES_URL would otherwise surface as @laundryroom/jobs' bare
// "Missing POSTGRES_URL" instead of the list of everything that is wrong).
import "./env";

import {
  groupAccountsConfig,
  groupAccountsConfigProblem,
} from "@laundryroom/group-accounts/worker";
import {
  enqueue,
  getBoss,
  jobNames,
  registerHandlers,
  stopBoss,
  syncSchedules,
} from "@laundryroom/jobs";

import { env } from "./env";
import { handlers, schedules } from "./handlers";

// How long running jobs get to finish after SIGTERM. After a deploy, dokku
// 0.37 keeps the old container running for the app's wait-to-retire (60 s by
// default; both workers take jobs meanwhile), then `docker stop`s it: SIGTERM,
// and SIGKILL after the app's stop-timeout-seconds (30 by default). This
// stays well below that. (dokku 0.38 sends the SIGTERM right away instead.)
const SHUTDOWN_TIMEOUT_MS = 20_000;
// Extra time for pg-boss to fail the leftover jobs and close its pool.
const EXIT_GRACE_MS = 5_000;

let stopping = false;

function stop(signal: NodeJS.Signals): void {
  if (stopping) {
    console.warn(`[worker] ${signal} again while stopping, exiting now`);
    process.exit(1);
  }
  stopping = true;
  console.log(
    `[worker] ${signal}: fetching no new jobs, waiting up to ${SHUTDOWN_TIMEOUT_MS / 1000}s for running ones`,
  );
  // stopBoss bounds the wait itself; this only catches a stop that hangs
  setTimeout(() => {
    console.error("[worker] shutdown did not finish in time, exiting");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS + EXIT_GRACE_MS).unref();
  stopBoss({ graceful: true, timeoutMs: SHUTDOWN_TIMEOUT_MS }).then(
    () => {
      console.log("[worker] stopped");
      process.exit(0);
    },
    (error: unknown) => {
      console.error("[worker] error while stopping", error);
      process.exit(1);
    },
  );
}

// Anything unexpected ends the process with a non-zero code, and docker's
// restart policy starts a fresh one. That needs the app's restart-policy set
// to `on-failure` without a maximum (README, "Worker"): dokku's default,
// on-failure:10, counts restarts over the container's whole life, so the 11th
// crash between two deploys would leave the worker stopped. The non-graceful
// stop fails the jobs this process still holds, so they are retried right
// away instead of waiting for their expiry.
function fatal(what: string, error: unknown): void {
  console.error(`[worker] ${what}, exiting`, error);
  if (stopping) process.exit(1);
  stopping = true;
  setTimeout(() => process.exit(1), EXIT_GRACE_MS).unref();
  void stopBoss({ graceful: false })
    .catch(() => undefined)
    .then(() => process.exit(1));
}

process.on("unhandledRejection", (reason) => {
  fatal("unhandled rejection", reason);
});
process.on("uncaughtException", (error) => {
  fatal("uncaught exception", error);
});
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

async function main(): Promise<void> {
  // half a group accounts config (a typo, a malformed rotation key) must not
  // quietly turn the feature off while groups with accounts keep publishing:
  // refuse to start, so the deploy's uptime check fails (names only, never
  // values)
  const groupAccountsProblem = groupAccountsConfigProblem();
  if (groupAccountsProblem) {
    throw new Error(
      `group accounts are misconfigured (${groupAccountsProblem}): fix the GROUP_* variables, or unset all of them`,
    );
  }
  // starts pg-boss: installs or migrates the `pgboss` schema, creates the
  // registry's queues and opens a pool of at most 3 connections
  const boss = await getBoss("worker");
  await registerHandlers(boss, handlers);
  await syncSchedules(boss, schedules);
  // one heartbeat per start, so the deploy log shows the queue round trip
  // working without waiting for the cron
  await enqueue("heartbeat", { trigger: "startup" });
  const groupAccounts = groupAccountsConfig();
  console.log(
    `[worker] ready: working ${jobNames.join(", ")}; heartbeat cron "${env.WORKER_HEARTBEAT_CRON}" (utc); group accounts ${
      groupAccounts
        ? `on (${groupAccounts.pdsUrl}, *.${groupAccounts.handleDomain})`
        : "off"
    }`,
  );
}

main().catch((error: unknown) => {
  // a signal during startup makes the remaining steps fail against the
  // stopped instance; stop() already reports and exits
  if (stopping) return;
  fatal("startup failed", error);
});
