// One-off: start the group account backfill, or (re)sync single groups.
// Bundled next to the worker as dist/backfill-group-accounts.mjs, so it runs
// from the production image as well (README, "Group accounts"):
//
//   dokku run laundryroom node apps/worker/dist/backfill-group-accounts.mjs [options]
//   pnpm -F @laundryroom/worker backfill-group-accounts [options]   # locally
//
// It only enqueues jobs; the running worker does the work, spaced out far
// below the relay's limits. Never run automatically (not on deploy).

// First, so a missing POSTGRES_URL is reported with everything else.
import "./env";

import { parseArgs } from "node:util";

import {
  describeError,
  groupAccountsConfig,
  groupAccountsConfigProblem,
  groupIdsWithAccount,
} from "@laundryroom/group-accounts/worker";
import { enqueue, getBoss, stopBoss } from "@laundryroom/jobs";

const USAGE = `usage: backfill-group-accounts [--group <id>]... [--resync] [--batch-size <n>] [--spacing <seconds>]

  (no option)       create accounts for every group that has none, oldest
                    first, --batch-size (10) at a time, one every --spacing
                    (60) seconds
  --group <id>      create (or finish, or re-sync) the account of this group
                    only, right away; repeatable. e.g. foodiespace first
  --resync          re-sync every group that has an account, one every
                    --spacing seconds: after a moderation change made in the
                    database that makes a group public again (taking one
                    off the network happens by itself, hourly), or to
                    re-encrypt every credential with a new
                    GROUP_CREDENTIAL_KEY_2. unchanged profiles are not
                    written again

  a group that became active less than a day ago goes on the network once
  that day is over, also when it is queued here`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function positiveInt(
  value: string | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    fail(`${name} must be a positive integer`);
  return parsed;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      group: { type: "string", multiple: true },
      resync: { type: "boolean" },
      "batch-size": { type: "string" },
      spacing: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const groups = values.group ?? [];
  for (const id of groups) {
    if (!UUID.test(id)) fail(`not a group id: ${id}`);
  }
  if (values.resync && groups.length > 0) {
    fail("--resync and --group do not go together");
  }
  const batchSize = positiveInt(values["batch-size"], "--batch-size");
  const spacingSeconds = positiveInt(values.spacing, "--spacing");

  const problem = groupAccountsConfigProblem();
  if (problem || !groupAccountsConfig()) {
    console.error(
      `group accounts are ${problem ? `misconfigured (${problem})` : "not configured (GROUP_PDS_URL, GROUP_HANDLE_DOMAIN, GROUP_PDS_ADMIN_PASSWORD, GROUP_CREDENTIAL_KEY_1, GROUP_EMAIL_DOMAIN)"}; nothing enqueued`,
    );
    process.exitCode = 1;
    return;
  }

  // send only: the worker process does the work
  await getBoss();
  try {
    if (groups.length > 0) {
      for (const groupId of groups) {
        const id = await enqueue(
          "group.ensureAccount",
          { groupId },
          { singletonKey: groupId },
        );
        console.log(
          id
            ? `group.ensureAccount ${groupId}: queued (job ${id})`
            : `group.ensureAccount ${groupId}: already queued`,
        );
      }
      return;
    }
    if (values.resync) {
      const ids = await groupIdsWithAccount();
      const spacing = (spacingSeconds ?? 60) * 1000;
      const start = Date.now();
      let queued = 0;
      for (const [index, groupId] of ids.entries()) {
        const id = await enqueue(
          "group.syncProfile",
          { groupId },
          {
            singletonKey: groupId,
            startAfter: new Date(start + index * spacing),
          },
        );
        if (id) queued++;
      }
      console.log(
        `group.syncProfile: queued ${queued} of ${ids.length} groups with an account, the last in ${Math.ceil((Math.max(ids.length - 1, 0) * spacing) / 60_000)} min`,
      );
      return;
    }
    const id = await enqueue(
      "group.backfillAccounts",
      { batchSize, spacingSeconds },
      { singletonKey: "backfill" },
    );
    console.log(
      id
        ? `group.backfillAccounts: queued (job ${id}). follow it with: dokku logs laundryroom -p worker -t`
        : "group.backfillAccounts: a backfill is already queued",
    );
  } finally {
    await stopBoss();
  }
}

main().then(
  // explicitly: the database pool would otherwise keep the process alive
  // until its idle connections time out
  () => process.exit(),
  async (error: unknown) => {
    console.error(`backfill-group-accounts failed: ${describeError(error)}`);
    await stopBoss().catch(() => undefined);
    process.exit(1);
  },
);
