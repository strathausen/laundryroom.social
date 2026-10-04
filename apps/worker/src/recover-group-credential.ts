// One-off: custody recovery of a group account whose stored credential is
// lost, refused or no longer decrypts (the worker logs "GIVING UP … recover
// it with recover-group-credential"). Bundled next to the worker as
// dist/recover-group-credential.mjs (README, "Group accounts"):
//
//   dokku run laundryroom node apps/worker/dist/recover-group-credential.mjs --group <id>
//   pnpm -F @laundryroom/worker recover-group-credential --group <id>   # locally
//
// With the pds admin password (com.atproto.admin.updateAccountPassword) it
// sets a new random master password, replaces the "laundryroom-writer" app
// password and stores both, encrypted exactly like the worker does (current
// key, bound to the group and column), then queues group.ensureAccount so
// the worker brings the account in line with the group. Prints no secret.

// First, so a missing POSTGRES_URL is reported with everything else.
import "./env";

import { parseArgs } from "node:util";

import {
  describeError,
  groupAccountsConfigProblem,
  recoverGroupCredential,
} from "@laundryroom/group-accounts/worker";
import { enqueue, getBoss, stopBoss } from "@laundryroom/jobs";

const USAGE = `usage: recover-group-credential --group <id>

  sets a new master password for the group's account with the pds admin
  password, replaces its app password, stores both encrypted and queues a
  sync. for a group whose stored credential is gone or refused; the old
  credential stops working`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      group: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const groupId = values.group;
  if (!groupId || !UUID.test(groupId)) fail("--group <id> is required");
  const problem = groupAccountsConfigProblem();
  if (problem) {
    console.error(`group accounts are misconfigured (${problem})`);
    process.exitCode = 1;
    return;
  }

  const account = await recoverGroupCredential(groupId);
  console.log(
    `recovered ${account.did} (@${account.handle}): new master and app password stored`,
  );
  await getBoss();
  try {
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
  } finally {
    await stopBoss();
  }
}

main().then(
  // explicitly: the database pool would otherwise keep the process alive
  // until its idle connections time out
  () => process.exit(),
  async (error: unknown) => {
    console.error(`recover-group-credential failed: ${describeError(error)}`);
    await stopBoss().catch(() => undefined);
    process.exit(1);
  },
);
