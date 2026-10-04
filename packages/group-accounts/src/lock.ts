import { getLockPool } from "@laundryroom/db/client";

import { GroupAccountError } from "./errors";

/** How long a job waits for another one of the same group to finish. */
const LOCK_WAIT = "60s";
/**
 * The lock's connection idles in its transaction while `fn` talks to the
 * pds (and fetches an image). A job gives up after GROUP_JOB_DEADLINE_MS
 * (below pg-boss's expiry of 10 min), so this only reaps a stuck one.
 */
const IDLE_LIMIT = "15min";

/**
 * Runs `fn` while holding a postgres advisory lock for the group, so the
 * group's jobs (create, sync, retire) never run side by side, also not
 * across queues or worker processes (old and new worker overlap during a
 * deploy). The lock lives in a transaction on a connection of the small
 * lock pool and is released by COMMIT, or by postgres when the connection
 * dies. Read the group row inside `fn`, so every job acts on what is current
 * when it holds the lock.
 *
 * `fn` gets a signal that aborts when the lock is lost (its connection
 * died, so postgres released it early and another job may take it): pass
 * it to every call and check it before every write, so a job that lost its
 * lock stops instead of racing the next one.
 */
export async function withGroupLock<T>(
  groupId: string,
  fn: (lockSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const name = `group-account:${groupId}`;
  const client = await getLockPool().connect();
  // pg-pool drops its own error listener while a client is checked out: a
  // connection dying meanwhile must not become an unhandled 'error' event.
  // postgres has then released the lock early; say so, and stop `fn`
  let lost: Error | undefined;
  const controller = new AbortController();
  const onError = (err: Error) => {
    if (lost) return;
    lost = err;
    console.error(
      `[group-accounts] the connection holding ${name} died (${err.message})`,
    );
    controller.abort(
      new GroupAccountError(`lost the lock of group ${groupId}`, {
        permanent: false,
      }),
    );
  };
  client.on("error", onError);
  const toError = (err: unknown) =>
    err instanceof Error ? err : new Error(String(err));
  let broken: Error | undefined;
  const finish = () => {
    client.off("error", onError);
    // a connection in an unknown state is destroyed, not reused
    client.release(broken ?? lost);
  };

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${LOCK_WAIT}'`);
    await client.query(
      `SET LOCAL idle_in_transaction_session_timeout = '${IDLE_LIMIT}'`,
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [name],
    );
  } catch (err) {
    await client.query("ROLLBACK").catch((rollbackErr: unknown) => {
      broken = toError(rollbackErr);
    });
    finish();
    throw err;
  }

  try {
    return await fn(controller.signal);
  } finally {
    // nothing but the lock lives in this transaction, so a failed COMMIT
    // loses nothing: the connection is dropped, which frees the lock
    await client.query("COMMIT").catch((err: unknown) => {
      broken = toError(err);
    });
    finish();
  }
}
