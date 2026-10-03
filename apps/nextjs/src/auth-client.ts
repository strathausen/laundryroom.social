import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * browser-side better auth client. no baseURL: the auth routes live on the
 * same origin under /api/auth, which is the client's default.
 */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

/**
 * the atproto plugin's entry point (packages/auth/src/atproto). only a form
 * on our own pages may post to it: the server refuses anything else, so a
 * link can never start a sign-in or connect an account.
 */
export const ATPROTO_SIGN_IN_PATH = "/api/auth/atproto/sign-in";

// whitespace, plus the invisible characters that ride along when a handle is
// copied out of an app: zero-width spaces and joiners, left-to-right /
// right-to-left marks and embeddings (bluesky wraps handles in u+202a ... u+202c),
// word joiners and the byte order mark. the server strips the same before it
// looks the handle up (normalizeIdentifier in packages/auth)
const HANDLE_NOISE = /[\s\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

/**
 * what people type is "@alice.bsky.social ", what the server wants is
 * "alice.bsky.social". dids and pds urls pass through unchanged (they hold
 * no whitespace and do not start with "@").
 */
export function cleanHandle(input: string): string {
  return input.replace(HANDLE_NOISE, "").replace(/^@+/, "");
}
