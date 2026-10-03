import type { OAuthClientMetadataInput } from "@atproto/oauth-client-node";
import { buildAtprotoLoopbackClientMetadata } from "@atproto/oauth-client-node";

import { env } from "../../env";

/**
 * Everything about the atproto oauth client that can be computed without the
 * private key or the database: which kind of client we are, its urls, the
 * scopes and the client metadata document. Safe to import from route
 * handlers and server components.
 */

/** the plugin's endpoints, under better-auth's default basePath */
export const SIGN_IN_PATH = "/api/auth/atproto/sign-in";
export const CALLBACK_PATH = "/api/auth/atproto/callback";
/** served by apps/nextjs route handlers, outside [locale] */
export const CLIENT_METADATA_PATH = "/oauth-client-metadata.json";
export const JWKS_PATH = "/oauth/jwks.json";

/**
 * The scopes every sign-in requests. Later slices extend this list (blob,
 * repo, include: permission sets). The authorization server rejects a
 * request (invalid_scope) unless every token in it appears verbatim in the
 * client metadata's `scope`, which is built from this list and the fallback
 * below.
 */
export const ATPROTO_SCOPES = ["atproto", "account:email?action=read"] as const;

/**
 * Raw-scope fallback for when ATPROTO_SCOPES carries an `include:` permission
 * set: if the authorization server cannot resolve the set it rejects the whole
 * request with invalid_scope, and the sign-in is retried once with this list
 * (the same permissions spelled out as raw scopes). null while there is no
 * permission set. The cast keeps typescript from narrowing it to null.
 */
export const ATPROTO_FALLBACK_SCOPES = null as readonly string[] | null;

export const ATPROTO_SCOPE = ATPROTO_SCOPES.join(" ");
export const ATPROTO_FALLBACK_SCOPE =
  ATPROTO_FALLBACK_SCOPES?.join(" ") ?? null;
/** what the client metadata declares: every token either request may carry */
export const ATPROTO_METADATA_SCOPE = [
  ...new Set([...ATPROTO_SCOPES, ...(ATPROTO_FALLBACK_SCOPES ?? [])]),
].join(" ");

/**
 * The public origin the client lives on: APP_URL (the canonical origin),
 * else AUTH_URL. In production both are https://www.laundryroom.social, the
 * host the client id and the jwks are fetched from; it must answer without a
 * redirect (pdses fetch both with redirect: "error").
 */
export function publicOrigin(): string | undefined {
  // the env schema strips a trailing slash, but not when validation is skipped
  return (env.APP_URL ?? env.AUTH_URL)?.replace(/\/+$/, "");
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export type AtprotoClientMode =
  | {
      /**
       * development: the keyless atproto loopback client. Its client id is
       * `http://localhost?redirect_uri=…&scope=…` and the authorization server
       * derives the metadata from it, so nothing has to be hosted. Loopback
       * redirect uris must use the ip literal 127.0.0.1, never "localhost".
       */
      kind: "loopback";
      origin: string;
      /** http://127.0.0.1:<port>, where the callback (and the session cookie) lands */
      loopbackOrigin: string;
      redirectUri: string;
    }
  | {
      /** production: confidential client, private_key_jwt with ES256 */
      kind: "confidential";
      origin: string;
      redirectUri: string;
    }
  | { kind: "disabled"; reason: string };

export function atprotoClientMode(): AtprotoClientMode {
  const origin = publicOrigin();
  if (!origin) {
    return { kind: "disabled", reason: "neither APP_URL nor AUTH_URL is set" };
  }
  if (isLoopbackOrigin(origin)) {
    const { port } = new URL(origin);
    const loopbackOrigin = `http://127.0.0.1${port ? `:${port}` : ""}`;
    return {
      kind: "loopback",
      origin,
      loopbackOrigin,
      redirectUri: `${loopbackOrigin}${CALLBACK_PATH}`,
    };
  }
  if (!origin.startsWith("https://")) {
    return {
      kind: "disabled",
      reason: `${origin} is neither https nor a loopback origin`,
    };
  }
  if (!env.ATPROTO_OAUTH_PRIVATE_JWK) {
    return { kind: "disabled", reason: "ATPROTO_OAUTH_PRIVATE_JWK is not set" };
  }
  return {
    kind: "confidential",
    origin,
    redirectUri: `${origin}${CALLBACK_PATH}`,
  };
}

/**
 * The client metadata. For the confidential client this is exactly the
 * document served at /oauth-client-metadata.json (the client id), for the
 * loopback client what the authorization server derives from the client id.
 */
export function atprotoClientMetadata(
  mode: Exclude<AtprotoClientMode, { kind: "disabled" }>,
): OAuthClientMetadataInput {
  if (mode.kind === "loopback") {
    return buildAtprotoLoopbackClientMetadata({
      scope: ATPROTO_METADATA_SCOPE,
      redirect_uris: [mode.redirectUri],
    });
  }
  const { origin } = mode;
  return {
    client_id: `${origin}${CLIENT_METADATA_PATH}`,
    client_name: "laundryroom",
    client_uri: origin,
    logo_uri: `${origin}/laundry-room-logo.png`,
    tos_uri: `${origin}/en/pages/terms`,
    policy_uri: `${origin}/en/pages/privacy_policy`,
    redirect_uris: [mode.redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "web",
    scope: ATPROTO_METADATA_SCOPE,
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256",
    dpop_bound_access_tokens: true,
    jwks_uri: `${origin}${JWKS_PATH}`,
  };
}

/**
 * Whether the login page should offer atproto sign-in and the "create an
 * account" button. Synchronous and side-effect free (it only looks at the
 * env), so server components can call it on every render. A malformed key
 * still counts as enabled here; sign-in then fails with server_error and the
 * cause is logged.
 */
export function atprotoLoginStatus(): {
  enabled: boolean;
  /** the host "create one on {host}" names, null when sign-up is off */
  signupHost: string | null;
} {
  const enabled = atprotoClientMode().kind !== "disabled";
  const pds = enabled ? signupPdsUrl() : undefined;
  let signupHost: string | null = null;
  try {
    signupHost = pds ? new URL(pds).host : null;
  } catch {
    // a malformed url (env validation skipped): no sign-up button
  }
  return { enabled, signupHost };
}

/** where "create an account" sends people (prompt=create), if anywhere */
export function signupPdsUrl(): string | undefined {
  return env.ATPROTO_SIGNUP_PDS_URL?.replace(/\/+$/, "");
}

export interface AtprotoDevNetwork {
  plcDirectoryUrl?: string;
  handleResolver?: string;
  publicAppview?: string;
}

/**
 * Development only: a local atproto network (e.g. @atproto/dev-env) to sign in
 * against, from the ATPROTO_DEV_* variables (packages/auth/env.ts). null in
 * production, outside loopback mode, and when none is set; the real network
 * (plc.directory, dns/https handle resolution, public.api.bsky.app) is used
 * then.
 */
export function atprotoDevNetwork(): AtprotoDevNetwork | null {
  if (env.NODE_ENV === "production") return null;
  if (atprotoClientMode().kind !== "loopback") return null;
  const network: AtprotoDevNetwork = {
    plcDirectoryUrl: env.ATPROTO_DEV_PLC_URL,
    handleResolver: env.ATPROTO_DEV_HANDLE_RESOLVER,
    publicAppview: env.ATPROTO_DEV_PUBLIC_APPVIEW,
  };
  return Object.values(network).some(Boolean) ? network : null;
}
