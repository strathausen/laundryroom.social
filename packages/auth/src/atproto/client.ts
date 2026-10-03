import type { OAuthSession } from "@atproto/oauth-client-node";
import { safeFetchWrap } from "@atproto-labs/fetch-node";
import {
  AtprotoHandleResolverNode,
  NodeOAuthClient,
  TokenInvalidError,
  TokenRefreshError,
  TokenRevokedError,
} from "@atproto/oauth-client-node";

import {
  atprotoClientMetadata,
  atprotoClientMode,
  atprotoDevNetwork,
} from "./config";
import { loadSigningKeys } from "./keys";
import { requestLock } from "./lock";
import { sessionStore, stateStore } from "./stores";

/**
 * No did cache (leaflet's trick): every resolution fetches the did document
 * afresh, so someone who moved to another pds is never sent to the old one.
 * Sign-ins and refreshes are rare enough that the extra plc lookup is free.
 */
const noDidCache = {
  get: () => undefined,
  set: () => undefined,
  del: () => undefined,
};

let clientPromise: Promise<NodeOAuthClient> | undefined;

/**
 * The oauth client, built on first use: never at import time (`next build`
 * evaluates this module without secrets) and never when atproto sign-in is
 * off. A failed build (e.g. a malformed key) is retried on the next call.
 */
export function getAtprotoOAuthClient(): Promise<NodeOAuthClient> {
  clientPromise ??= createClient().catch((err: unknown) => {
    clientPromise = undefined;
    throw err;
  });
  return clientPromise;
}

/**
 * Every url the oauth client fetches comes from someone else: the did
 * document (did:web names any host), the pds and authorization server it
 * points at, and the endpoints their metadata lists. So all of it goes
 * through the ssrf filter of @atproto-labs/fetch-node: https only, and no
 * private, loopback or link-local addresses, checked again at connect time
 * and on every redirect hop. Custom ports stay allowed (self-hosted pdses use
 * them); implicit redirects too, because the oauth client wraps its token
 * requests in Request objects (each hop is still checked). The timeout stays
 * at the oauth client's own 30s refresh budget, so it never cuts a refresh
 * short that the client would have waited for.
 */
const safeFetch = safeFetchWrap({
  fetch: globalThis.fetch,
  ssrfProtection: true,
  allowCustomPort: true,
  allowImplicitRedirect: true,
  timeout: 30_000,
});

async function createClient(): Promise<NodeOAuthClient> {
  const mode = atprotoClientMode();
  if (mode.kind === "disabled") {
    throw new Error(`atproto sign-in is disabled: ${mode.reason}`);
  }
  // development against a local network (plain http, private addresses):
  // no ssrf filter there, see atprotoDevNetwork
  const devNetwork = atprotoDevNetwork();
  return new NodeOAuthClient({
    clientMetadata: atprotoClientMetadata(mode),
    // the loopback client is public (token_endpoint_auth_method none)
    keyset: mode.kind === "confidential" ? await loadSigningKeys() : undefined,
    stateStore,
    sessionStore,
    requestLock,
    didCache: noDidCache,
    ...(devNetwork
      ? {
          allowHttp: true,
          ...(devNetwork.plcDirectoryUrl
            ? { plcDirectoryUrl: devNetwork.plcDirectoryUrl }
            : {}),
          ...(devNetwork.handleResolver
            ? { handleResolver: devNetwork.handleResolver }
            : {}),
        }
      : {
          fetch: safeFetch,
          // built here rather than by the client: given our `fetch`, the
          // client would wrap the already filtered fetch in its own filter,
          // which refuses to stack (it has its own, stricter one for the
          // https://<handle>/.well-known/atproto-did lookup)
          handleResolver: new AtprotoHandleResolverNode(),
        }),
  });
}

/**
 * The oauth session of a did is gone for good: the refresh token expired or
 * was revoked (the person signed out of laundryroom on their pds, or it was
 * idle for months), or the session was deleted. Normal, not an error: the
 * better-auth session (30 days) and the oauth session (each refresh token at
 * most 180 days on bsky.social) do not line up. The person has to sign in
 * with their pds again ("reconnect"), e.g. with a form that posts
 * handle=<did> to /api/auth/atproto/sign-in.
 */
export function isReconnectError(err: unknown): boolean {
  return (
    err instanceof TokenRefreshError ||
    err instanceof TokenRevokedError ||
    err instanceof TokenInvalidError
  );
}

export type AtprotoSessionResult =
  | { status: "ok"; session: OAuthSession }
  /** the oauth session is dead, the person has to sign in with their pds again */
  | { status: "reconnect"; did: string; error: unknown }
  /** the pds, the plc directory or our database did not answer; try later */
  | { status: "unavailable"; did: string; error: unknown };

const pendingRestores = new Map<string, Promise<OAuthSession>>();

/**
 * Load the oauth session of a did, refreshing its tokens when they are about
 * to expire. Concurrent calls for the same did in this process share one
 * restore (one refresh); across processes the advisory lock serialises them.
 * Never throws: dead sessions come back as "reconnect", everything else as
 * "unavailable".
 */
export async function restoreAtprotoSession(
  did: string,
): Promise<AtprotoSessionResult> {
  let pending = pendingRestores.get(did);
  if (!pending) {
    pending = getAtprotoOAuthClient()
      .then((client) => client.restore(did))
      .finally(() => pendingRestores.delete(did));
    pendingRestores.set(did, pending);
  }
  try {
    return { status: "ok", session: await pending };
  } catch (error) {
    // the token errors above, or any other failure after which the oauth
    // client deleted the stored session as unusable: e.g. the key that bound
    // it left the keyset (its AuthMethodUnsatisfiableError is not exported
    // and has no name of its own), or the stored value no longer parses.
    // A session that is still stored failed for a passing reason.
    if (isReconnectError(error) || !(await hasStoredSession(did))) {
      return { status: "reconnect", did, error };
    }
    console.error(
      `[atproto] restoring the oauth session of ${did} failed`,
      error,
    );
    return { status: "unavailable", did, error };
  }
}

/** whether a session for the did is stored; true when that is unknown */
async function hasStoredSession(did: string): Promise<boolean> {
  try {
    return (await sessionStore.get(did)) !== undefined;
  } catch {
    return true;
  }
}

/**
 * Revoke the oauth session of a did at its authorization server and forget
 * it here (account deletion). Best effort: when the authorization server
 * cannot be reached the stored session is deleted anyway.
 */
export async function forgetAtprotoSession(did: string): Promise<void> {
  try {
    const client = await getAtprotoOAuthClient();
    // deletes the stored session too, whether or not the revocation went through
    await client.revoke(did);
  } catch (err) {
    console.error(`[atproto] revoking the oauth session of ${did} failed`, err);
    try {
      await sessionStore.del(did);
    } catch (delErr) {
      console.error(
        `[atproto] deleting the oauth session of ${did} failed`,
        delErr,
      );
    }
  }
}
