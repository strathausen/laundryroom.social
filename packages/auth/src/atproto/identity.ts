import type { NodeOAuthClient, OAuthSession } from "@atproto/oauth-client-node";
import { z } from "zod";

import { atprotoDevNetwork } from "./config";

/**
 * What a sign-in learns about the person, besides the did the token was
 * issued for. Each lookup is best effort and bounded in time: a slow or
 * broken appview must not break the sign-in.
 */

/** bluesky's public appview, read anonymously for the display name only */
const PUBLIC_APPVIEW = "https://public.api.bsky.app";

/**
 * The pdses whose word on `emailConfirmed` we take, by host suffix. A pds
 * vouches for the address through com.atproto.server.getSession, and anyone
 * running their own pds can make it vouch for any address, which would turn
 * our notification mail into a relay to strangers. bluesky's own pdses
 * (`<name>.<region>.host.bsky.network`) do confirm addresses; add lndry.me
 * once it runs. Everyone else gets mail only at an address they confirmed to
 * us (google, magic link) until we verify contact addresses ourselves.
 */
const EMAIL_TRUSTED_PDS_SUFFIXES = [".host.bsky.network"];

export function isEmailTrustedPds(pdsUrl: string | undefined): boolean {
  if (!pdsUrl) return false;
  try {
    const url = new URL(pdsUrl);
    return (
      url.protocol === "https:" &&
      EMAIL_TRUSTED_PDS_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

/**
 * The handle of a did, verified both ways (the did document claims it and
 * the handle resolves back to the did). null when the check fails ("handle
 * invalid"), undefined when the lookup itself failed.
 */
export async function resolveVerifiedHandle(
  client: NodeOAuthClient,
  did: string,
): Promise<string | null | undefined> {
  try {
    const { handle } = await client.identityResolver.resolve(did, {
      signal: AbortSignal.timeout(10_000),
      noCache: true,
    });
    return handle === "handle.invalid" ? null : handle;
  } catch (err) {
    console.error(`[atproto] resolving the handle of ${did} failed`, err);
    return undefined;
  }
}

const profileSchema = z.object({
  did: z.string(),
  displayName: z.string().optional(),
});

/**
 * The display name from the person's bluesky profile, if they have one.
 * Nothing else is taken from it: avatars stay out until we proxy images
 * ourselves (no hotlinking of cdn.bsky.app).
 */
export async function fetchDisplayName(did: string): Promise<string | null> {
  try {
    const appview = atprotoDevNetwork()?.publicAppview ?? PUBLIC_APPVIEW;
    const url = new URL("/xrpc/app.bsky.actor.getProfile", appview);
    url.searchParams.set("actor", did);
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    // 400 "Profile not found" for people without a bluesky profile
    if (!res.ok) return null;
    const profile = profileSchema.safeParse(await res.json());
    if (!profile.success || profile.data.did !== did) return null;
    return profile.data.displayName?.trim() ?? null;
  } catch (err) {
    console.error(`[atproto] fetching the profile of ${did} failed`, err);
    return null;
  }
}

const serverSessionSchema = z.object({
  did: z.string(),
  email: z.string().optional(),
  emailConfirmed: z.boolean().optional(),
});

/**
 * The person's email as their pds knows it, via com.atproto.server.getSession
 * (the pds only includes it with the account:email scope). Only a confirmed
 * address from a pds we trust to confirm addresses counts (see
 * EMAIL_TRUSTED_PDS_SUFFIXES; `pdsUrl` is the one the session talks to).
 * `{ ok: false }` when the call failed, so the caller keeps what it had;
 * `email: null` when there is no address to use (which also clears an old
 * one).
 *
 * Used to deliver mail, never to find or link accounts.
 */
export async function fetchConfirmedEmail(
  session: OAuthSession,
  pdsUrl: string | undefined,
): Promise<{ ok: true; email: string | null } | { ok: false }> {
  // unknown (the stored session could not be read): keep what we had
  if (pdsUrl === undefined) return { ok: false };
  if (!isEmailTrustedPds(pdsUrl)) return { ok: true, email: null };
  try {
    const res = await session.fetchHandler(
      "/xrpc/com.atproto.server.getSession",
      {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      console.error(
        `[atproto] com.atproto.server.getSession for ${session.did} answered ${res.status}`,
      );
      return { ok: false };
    }
    const body = serverSessionSchema.safeParse(await res.json());
    if (!body.success || body.data.did !== session.did) return { ok: false };
    const { email, emailConfirmed } = body.data;
    const address = email?.trim().toLowerCase();
    const valid =
      emailConfirmed === true &&
      !!address &&
      address.length <= 255 &&
      z.string().email().safeParse(address).success;
    return { ok: true, email: valid ? address : null };
  } catch (err) {
    console.error(
      `[atproto] com.atproto.server.getSession for ${session.did} failed`,
      err,
    );
    return { ok: false };
  }
}
