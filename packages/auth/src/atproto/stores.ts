import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

import { eq, lt } from "@laundryroom/db";
import { db } from "@laundryroom/db/client";
import { AtprotoOAuthSession, AtprotoOAuthState } from "@laundryroom/db/schema";

import { encryptionSecret } from "../secret";

/**
 * Postgres-backed stores for @atproto/oauth-client-node. Both hold private
 * key material (the dpop key, the pkce verifier, the single-use refresh
 * token), so values are encrypted at rest with AUTH_SECRET (xchacha20-poly1305
 * via better-auth/crypto, the same scheme better-auth uses for the google
 * tokens). A value that no longer decrypts (AUTH_SECRET rotated) reads as
 * missing: the sign-in in progress fails, or the person reconnects.
 */

/** authorization servers give up on a request long before this */
const STATE_TTL_MS = 60 * 60 * 1000;

async function seal(value: unknown): Promise<string> {
  return symmetricEncrypt({
    key: encryptionSecret(),
    data: JSON.stringify(value),
  });
}

async function unseal<T>(sealed: string, what: string): Promise<T | undefined> {
  try {
    const json = await symmetricDecrypt({
      key: encryptionSecret(),
      data: sealed,
    });
    return JSON.parse(json) as T;
  } catch (err) {
    console.error(`[atproto] could not decrypt a stored ${what}`, err);
    return undefined;
  }
}

export const stateStore: NodeSavedStateStore = {
  async set(key, state) {
    const value = await seal(state);
    await db
      .insert(AtprotoOAuthState)
      .values({ key, value })
      .onConflictDoUpdate({
        target: AtprotoOAuthState.key,
        set: { value, createdAt: new Date() },
      });
    // opportunistic sweep: abandoned sign-ins leave their row behind, and
    // every new sign-in clears what is older than an hour. the table holds a
    // handful of rows, a failed sweep is retried by the next sign-in
    try {
      await db
        .delete(AtprotoOAuthState)
        .where(
          lt(AtprotoOAuthState.createdAt, new Date(Date.now() - STATE_TTL_MS)),
        );
    } catch (err) {
      console.error("[atproto] sweeping old oauth states failed", err);
    }
  },
  async get(key) {
    const [row] = await db
      .select()
      .from(AtprotoOAuthState)
      .where(eq(AtprotoOAuthState.key, key));
    if (!row) return undefined;
    if (row.createdAt.getTime() < Date.now() - STATE_TTL_MS) {
      await db.delete(AtprotoOAuthState).where(eq(AtprotoOAuthState.key, key));
      return undefined;
    }
    return unseal<NodeSavedState>(row.value, "oauth state");
  },
  async del(key) {
    await db.delete(AtprotoOAuthState).where(eq(AtprotoOAuthState.key, key));
  },
};

/**
 * The app state a pending sign-in carries (see plugin.ts), read without
 * consuming the state: the callback checks it against the browser before it
 * lets the oauth client redeem the code. null when there is no such sign-in
 * (unknown, expired or already used).
 */
export async function peekAppState(
  key: string,
): Promise<{ appState: string | undefined } | null> {
  const state = await stateStore.get(key);
  return state ? { appState: state.appState } : null;
}

export const sessionStore: NodeSavedSessionStore = {
  async set(did, session) {
    const value = await seal(session);
    await db
      .insert(AtprotoOAuthSession)
      .values({ did, value })
      .onConflictDoUpdate({
        target: AtprotoOAuthSession.did,
        set: { value, updatedAt: new Date() },
      });
  },
  async get(did) {
    const [row] = await db
      .select({ value: AtprotoOAuthSession.value })
      .from(AtprotoOAuthSession)
      .where(eq(AtprotoOAuthSession.did, did));
    if (!row) return undefined;
    return unseal<NodeSavedSession>(row.value, "oauth session");
  },
  async del(did) {
    await db
      .delete(AtprotoOAuthSession)
      .where(eq(AtprotoOAuthSession.did, did));
  },
};
