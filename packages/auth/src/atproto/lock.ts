import type { RuntimeLock } from "@atproto/oauth-client-node";

import { getLockPool } from "@laundryroom/db/client";

/**
 * requestLock for the oauth client: refresh tokens are single-use, so two
 * processes (or two requests) refreshing the same session at once would make
 * the authorization server revoke it. The client takes this lock around
 * every session read that may refresh, named `@atproto-oauth-client-<did>`.
 *
 * Two layers:
 * - in this process, an async queue per name, so concurrent requests for the
 *   same did wait here without holding a database connection (the oauth
 *   client takes the lock before its own in-process de-duplication, and one
 *   sign-in alone takes it several times);
 * - across processes, a postgres advisory transaction lock on a connection
 *   from the small dedicated lock pool (getLockPool in packages/db), never
 *   from the app pool: the stores inside `fn` and every other query use the
 *   app pool, so slow authorization servers can at worst make other atproto
 *   sign-ins wait, never the rest of the app. The lock is held until COMMIT /
 *   ROLLBACK and released by postgres itself if the connection goes away.
 *
 * Waiting is capped at 45s on both layers (lock_timeout applies to advisory
 * locks too); the oauth client aborts its own refresh after 30s, so a longer
 * wait means something is stuck.
 */

const LOCK_WAIT_MS = 45_000;

/** per lock name: settles once everyone queued so far is done */
const queues = new Map<string, Promise<void>>();

async function withLocalLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(name) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const mine = new Promise<void>((resolve) => {
    release = resolve;
  });
  // whoever comes next waits for the ones before us and for us
  const tail = previous.then(() => mine);
  queues.set(name, tail);
  try {
    await within(previous, LOCK_WAIT_MS, name);
    return await fn();
  } finally {
    release();
    if (queues.get(name) === tail) queues.delete(name);
  }
}

function within(
  promise: Promise<void>,
  ms: number,
  name: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out waiting for the lock ${name}`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function withAdvisoryLock<T>(
  name: string,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  const client = await getLockPool().connect();
  // pg-pool drops its own error listener while a client is checked out, and
  // this one sits idle in a transaction while `fn` talks to an authorization
  // server. If the connection dies meanwhile (postgres restart, a network
  // blip), postgres has released the lock under our feet: log it loudly
  // instead of crashing on an unhandled 'error' event. COMMIT then fails and
  // the connection is destroyed below.
  let lost: Error | undefined;
  const onError = (err: Error) => {
    if (lost) return; // a dying connection reports more than once
    lost = err;
    console.error(
      `[atproto] the connection holding ${name} died; the lock was released early`,
      err,
    );
  };
  client.on("error", onError);
  // a connection whose transaction state is unknown must not go back to the
  // pool: release(err) destroys it instead (which also frees the lock)
  let broken: Error | undefined;
  const finish = () => {
    client.off("error", onError);
    client.release(broken ?? lost);
  };
  let result: T;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '45s'");
    // explicit, so a server default (or a later dokku setting) never kills
    // the connection, and with it the lock, in the middle of a refresh
    await client.query(
      "SET LOCAL idle_in_transaction_session_timeout = '2min'",
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [name],
    );
    result = await fn();
  } catch (err) {
    await client.query("ROLLBACK").catch((rollbackErr: unknown) => {
      broken = toError(rollbackErr);
    });
    finish();
    throw err;
  }
  // nothing but the lock lives in this transaction, so a failed COMMIT loses
  // nothing: the connection is dropped (releasing the lock) and the result of
  // fn, e.g. a refreshed token set that is already stored, still stands
  await client.query("COMMIT").catch((commitErr: unknown) => {
    broken = toError(commitErr);
  });
  finish();
  return result;
}

export const requestLock: RuntimeLock = <T>(
  name: string,
  fn: () => T | PromiseLike<T>,
) => withLocalLock(name, () => withAdvisoryLock(name, fn));

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
