import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NodeOAuthClient, OAuthSession } from "@atproto/oauth-client-node";
import type { BetterAuthPlugin, User } from "better-auth";
import {
  FetchError,
  isAtprotoDid,
  OAuthCallbackError,
  OAuthResolverError,
  OAuthResponseError,
} from "@atproto/oauth-client-node";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import { ATPROTO_PLACEHOLDER_EMAIL_DOMAIN } from "@laundryroom/email";

import type { AtprotoClientMode } from "./config";
import { forgetAtprotoSession, getAtprotoOAuthClient } from "./client";
import {
  ATPROTO_FALLBACK_SCOPE,
  ATPROTO_SCOPE,
  atprotoClientMode,
  CALLBACK_PATH,
  SIGN_IN_PATH,
  signupPdsUrl,
} from "./config";
import {
  fetchConfirmedEmail,
  fetchDisplayName,
  resolveVerifiedHandle,
} from "./identity";
import { peekAppState, sessionStore, stateStore } from "./stores";

/**
 * Sign in with an atproto account, as a better-auth plugin (modelled on the
 * unmerged better-auth pr #9565, against the plugin api of better-auth 1.7).
 * Better-auth stays the session and cookie layer; the oauth client
 * (client.ts) handles the authorization server.
 *
 *   POST /api/auth/atproto/sign-in
 *       form fields: handle=<handle|did|pds url>, callbackURL=<path>
 *       [, link=1] [, signup=1]
 *     only from our own pages (a same-origin form post, see isOwnFormPost):
 *     resolves the handle and 302s to the person's authorization server.
 *     link=1 attaches the account to the signed-in user; signup=1 (only with
 *     ATPROTO_SIGNUP_PDS_URL set) opens "create an account" on our pds.
 *     Not a GET: a link (in a profile, a chat app, a redirect chain) could
 *     then start a link=1 in a signed-in victim's browser and attach an
 *     attacker's account to their profile, sign them into the attacker's
 *     account, or bounce them to whatever authorization server a handle
 *     names.
 *   GET /api/auth/atproto/callback
 *     where the authorization server sends the browser back. Finds the user
 *     by the did (never by email), signs them in, links, or creates them, and
 *     302s to the callbackURL.
 *
 * Every failure redirects to /<locale>/login?error=atproto_<code> (see
 * AtprotoErrorCode), never to a raw error page; a rate-limited request, and
 * a sign-in better-auth's origin check refuses, are turned into one too
 * (atprotoErrorRedirect).
 */

export const ATPROTO_PROVIDER_ID = "atproto";

/**
 * Error codes on /<locale>/login?error=atproto_<code>:
 * - invalid_handle: the input is not a handle, a did or an https url
 * - resolve_failed: the handle/did did not resolve, or its pds / authorization
 *   server could not be reached
 * - cancelled: the person cancelled on their authorization server
 * - denied: the authorization server refused the request, the sign-in was not
 *   posted from our own pages (or better-auth's origin check refused it), or
 *   signup=1 while sign-up is off
 * - expired: the callback belongs to no pending sign-in in this browser (it
 *   took over an hour, was already used, or started in another browser)
 * - signed_out: link=1 without being signed in, or signed in as someone else
 *   by the time the callback came back
 * - already_linked: the atproto account belongs to another laundryroom user
 * - has_other_account: the signed-in user already has a different atproto
 *   account
 * - rate_limited: too many sign-ins from this address
 * - server_error: anything else (logged)
 */
export type AtprotoErrorCode =
  | "invalid_handle"
  | "resolve_failed"
  | "cancelled"
  | "denied"
  | "expired"
  | "signed_out"
  | "already_linked"
  | "has_other_account"
  | "rate_limited"
  | "server_error";

export interface AtprotoPluginOptions {
  /**
   * The app's locales and default locale, to send errors to the login page in
   * the person's language. Keep in sync with apps/nextjs/src/i18n/routing.ts.
   */
  locales: readonly string[];
  defaultLocale: string;
}

/**
 * Binds a sign-in to the browser that started it: the nonce travels in the
 * (server-side, encrypted) oauth state and in this signed cookie, and the
 * callback only proceeds when both match. Without it a callback url from
 * someone else's sign-in would sign the person who opens it into that
 * account. Scoped to the plugin's paths, lax so it survives the top-level
 * redirect back from the authorization server.
 */
const STATE_COOKIE = "atproto_state";
const STATE_COOKIE_MAX_AGE = 60 * 60; // the oauth state lives an hour too

/** what the sign-in hands the callback through the oauth state */
const appStateSchema = z.object({
  nonce: z.string().min(16),
  callbackURL: z.string(),
  locale: z.string(),
  /** set for link=1: the user the account gets linked to */
  linkUserId: z.string().optional(),
});
type AppState = z.infer<typeof appStateSchema>;

type EndpointContext = Parameters<typeof setSessionCookie>[0];
type EnabledMode = Exclude<AtprotoClientMode, { kind: "disabled" }>;

export const atproto = (options: AtprotoPluginOptions) => {
  return {
    id: "atproto",
    endpoints: {
      atprotoSignIn: createAuthEndpoint(
        "/atproto/sign-in",
        {
          method: "POST",
          // what a plain html form posts (also without javascript)
          metadata: {
            allowedMediaTypes: [
              "application/x-www-form-urlencoded",
              "application/json",
            ],
          },
        },
        async (ctx) => {
          const body = (ctx.body ?? {}) as Record<string, unknown>;
          const requested = safeCallbackPath(firstString(body.callbackURL));
          const locale = pickLocale(options, {
            callbackURL: requested,
            cookie: ctx.getCookie("NEXT_LOCALE"),
            acceptLanguage: ctx.request?.headers.get("accept-language"),
          });
          // with the locale in it, so landing there needs no locale redirect
          const callbackURL = localizedPath(requested, locale, options);
          let target: string;
          try {
            target = await startSignIn(ctx, atprotoClientMode(), {
              handle: firstString(body.handle),
              link: isFlag(body.link),
              signup: isFlag(body.signup),
              callbackURL,
              locale,
            });
          } catch (err) {
            if (isAPIError(err)) throw err;
            ctx.context.logger.error("[atproto] sign-in failed", err);
            target = loginErrorUrl(locale, "server_error", callbackURL);
          }
          throw ctx.redirect(target);
        },
      ),
      atprotoCallback: createAuthEndpoint(
        "/atproto/callback",
        { method: "GET" },
        async (ctx) => {
          const query = ctx.query as Record<string, unknown> | undefined;
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(query ?? {})) {
            const first = firstString(value);
            if (first !== undefined) params.set(key, first);
          }
          let target: string;
          try {
            target = await finishSignIn(ctx, params, options);
          } catch (err) {
            if (isAPIError(err)) throw err;
            ctx.context.logger.error("[atproto] callback failed", err);
            const locale = pickLocale(options, {
              cookie: ctx.getCookie("NEXT_LOCALE"),
              acceptLanguage: ctx.request?.headers.get("accept-language"),
            });
            target = loginErrorUrl(locale, "server_error", `/${locale}`);
          }
          throw ctx.redirect(target);
        },
      ),
    },
    hooks: {
      before: [
        {
          // better-auth's own unlink-account would delete only the account
          // row: user.did would stay (so the next sign-in with that did fails
          // on its unique index) and the stored oauth session, refresh token
          // included, would never be revoked. Refused until unlinking also
          // clears did/handle/contact_email and calls forgetAtprotoSession.
          matcher: (context) => context.path === "/unlink-account",
          handler: createAuthMiddleware((ctx) => {
            const body = ctx.body as { providerId?: unknown } | undefined;
            if (body?.providerId === ATPROTO_PROVIDER_ID) {
              return Promise.reject(
                new APIError("BAD_REQUEST", {
                  message: "an atproto account cannot be disconnected yet",
                }),
              );
            }
            return Promise.resolve();
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
};

// ---------------------------------------------------------------------------
// sign-in
// ---------------------------------------------------------------------------

async function startSignIn(
  ctx: EndpointContext,
  mode: AtprotoClientMode,
  request: {
    handle: string | undefined;
    link: boolean;
    signup: boolean;
    callbackURL: string;
    locale: string;
  },
): Promise<string> {
  const { callbackURL, locale } = request;
  const fail = (code: AtprotoErrorCode) =>
    loginErrorUrl(
      locale,
      code,
      callbackURL,
      // a typo is easier to fix than to retype
      code === "invalid_handle" || code === "resolve_failed"
        ? handleForRetry(request.handle)
        : undefined,
    );

  if (mode.kind === "disabled") {
    ctx.context.logger.error(`[atproto] sign-in is disabled: ${mode.reason}`);
    return fail("server_error");
  }
  if (!isOwnFormPost(ctx.request?.headers, mode)) {
    ctx.context.logger.warn("[atproto] refused a sign-in not posted by us");
    return fail("denied");
  }

  let linkUserId: string | undefined;
  if (request.link) {
    const current = await getSessionFromCtx(ctx, { disableCookieCache: true });
    if (!current) return fail("signed_out");
    linkUserId = current.user.id;
  }

  let input: string;
  let prompt: "create" | undefined;
  if (request.signup) {
    const pds = signupPdsUrl();
    if (!pds) return fail("denied");
    // login_hint cannot go along when authorize() gets a url, so the pds's
    // sign-up form starts empty
    input = pds;
    prompt = "create";
  } else {
    const identifier = normalizeIdentifier(request.handle, {
      allowLocal: mode.kind === "loopback",
    });
    if (!identifier) return fail("invalid_handle");
    input = identifier;
  }

  const nonce = randomBytes(24).toString("base64url");
  const appState: AppState = {
    nonce,
    callbackURL,
    locale,
    ...(linkUserId ? { linkUserId } : {}),
  };
  let authorizationUrl: URL;
  try {
    const client = await getAtprotoOAuthClient();
    authorizationUrl = await authorize(client, input, {
      state: JSON.stringify(appState),
      prompt,
    });
  } catch (err) {
    const code = classifyAuthorizeError(err);
    if (code === "server_error") {
      ctx.context.logger.error("[atproto] authorize failed", err);
    } else {
      ctx.context.logger.warn(`[atproto] authorize failed (${code})`, err);
    }
    return fail(code);
  }

  const cookie = stateCookie(ctx);
  await ctx.setSignedCookie(
    cookie.name,
    nonce,
    ctx.context.secret,
    cookie.attributes,
  );
  return authorizationUrl.toString();
}

/**
 * Whether the sign-in was posted by one of our own pages. Browsers send
 * Sec-Fetch-Site with every request, and only "same-origin" is us: "none"
 * (a link opened from a chat or mail app, the address bar), "same-site" and
 * "cross-site" are not. Origin comes with every form post ("null" from
 * sandboxed and no-referrer contexts never matches); browsers too old for
 * either have to send a Referer of ours. Neither at all: refused.
 *
 * Development (loopback): our pages run on http://127.0.0.1:<port>, where
 * the callback lands (the middleware in apps/nextjs sends localhost and [::1]
 * there), so that is our only origin.
 */
function isOwnFormPost(
  headers: Headers | undefined,
  mode: EnabledMode,
): boolean {
  if (!headers) return false;
  const site = headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") return false;
  const ours =
    mode.kind === "loopback" ? mode.loopbackOrigin : originOf(mode.origin);
  const origin = headers.get("origin") ?? originOf(headers.get("referer"));
  return origin !== null && origin === ours;
}

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * authorize() with the scope list, retried once with the raw-scope fallback
 * when the authorization server rejects the request as invalid_scope (an
 * include: permission set it cannot resolve). No fallback is configured yet.
 */
async function authorize(
  client: NodeOAuthClient,
  input: string,
  options: { state: string; prompt: "create" | undefined },
): Promise<URL> {
  const authorizeWith = (scope: string) =>
    client.authorize(input, {
      scope,
      state: options.state,
      ...(options.prompt ? { prompt: options.prompt } : {}),
      // handle, did document and authorization server metadata lookups
      signal: AbortSignal.timeout(20_000),
    });
  try {
    return await authorizeWith(ATPROTO_SCOPE);
  } catch (err) {
    if (
      ATPROTO_FALLBACK_SCOPE &&
      err instanceof OAuthResponseError &&
      err.error === "invalid_scope"
    ) {
      return authorizeWith(ATPROTO_FALLBACK_SCOPE);
    }
    throw err;
  }
}

/**
 * oauth errors that are our (or the server's) fault, not a refusal of this
 * person or request: a client id / metadata / jwks the authorization server
 * could not fetch or did not accept, or an outage on its side
 */
const SERVER_SIDE_OAUTH_ERRORS = new Set([
  "invalid_client",
  "invalid_client_id",
  "invalid_client_metadata",
  "invalid_redirect_uri",
  "unauthorized_client",
  "server_error",
  "temporarily_unavailable",
]);

function classifyAuthorizeError(err: unknown): AtprotoErrorCode {
  if (err instanceof OAuthResponseError) {
    // the authorization server answered the pushed authorization request
    return err.error && SERVER_SIDE_OAUTH_ERRORS.has(err.error)
      ? "server_error"
      : "denied";
  }
  if (err instanceof OAuthResolverError || err instanceof FetchError) {
    return "resolve_failed";
  }
  if (
    err instanceof Error &&
    (err.name === "AbortError" || err.name === "TimeoutError")
  ) {
    return "resolve_failed";
  }
  return "server_error";
}

// ---------------------------------------------------------------------------
// callback
// ---------------------------------------------------------------------------

async function finishSignIn(
  ctx: EndpointContext,
  params: URLSearchParams,
  options: AtprotoPluginOptions,
): Promise<string> {
  const cookie = stateCookie(ctx);
  const cookieNonce = await ctx.getSignedCookie(
    cookie.name,
    ctx.context.secret,
  );
  // single use, whatever happens next
  ctx.setCookie(cookie.name, "", { ...cookie.attributes, maxAge: 0 });

  // read the app state before the code is redeemed: the locale and callback
  // url for the redirect, and the nonce that ties the flow to this browser
  const stateKey = params.get("state");
  const pending = stateKey ? await peekAppState(stateKey) : null;
  const appState = pending ? parseAppState(pending.appState) : undefined;
  const locale =
    appState?.locale ??
    pickLocale(options, {
      cookie: ctx.getCookie("NEXT_LOCALE"),
      acceptLanguage: ctx.request?.headers.get("accept-language"),
    });
  const callbackURL = localizedPath(
    safeCallbackPath(appState?.callbackURL),
    locale,
    options,
  );
  const fail = (code: AtprotoErrorCode) =>
    loginErrorUrl(locale, code, callbackURL);

  if (!stateKey || !pending) {
    // no pending sign-in by that state: older than an hour (someone who took
    // their time on the authorization server), already used (a reload, the
    // link opened twice) or never ours. Nothing to redeem; start over.
    ctx.context.logger.warn("[atproto] callback for an unknown or old sign-in");
    return fail("expired");
  }
  if (
    !appState ||
    typeof cookieNonce !== "string" ||
    !sameString(cookieNonce, appState.nonce)
  ) {
    // started in another browser (or the cookie expired): never redeem it here
    ctx.context.logger.warn(
      "[atproto] callback without the matching state cookie",
    );
    await stateStore.del(stateKey);
    return fail("expired");
  }

  const client = await getAtprotoOAuthClient();
  let session: OAuthSession;
  try {
    ({ session } = await client.callback(params));
  } catch (err) {
    const code = classifyCallbackError(err);
    if (code === "server_error") {
      ctx.context.logger.error("[atproto] oauth callback failed", err);
    } else {
      ctx.context.logger.warn(`[atproto] oauth callback failed (${code})`, err);
    }
    return fail(code);
  }

  const did = session.did;
  // the token set callback() just stored: the scope granted and the pds the
  // session talks to, read straight from the store (no lock, no network)
  const tokenSet = (await readStoredSession(ctx, did))?.tokenSet;
  const [handle, displayName, email] = await Promise.all([
    resolveVerifiedHandle(client, did),
    fetchDisplayName(did),
    fetchConfirmedEmail(session, tokenSet?.aud),
  ]);
  const profile: Profile = {
    did,
    // refreshed at every sign-in; a failed lookup keeps the stored values
    fields: {
      did,
      ...(handle !== undefined ? { handle } : {}),
      ...(email.ok ? { contactEmail: email.email } : {}),
    },
    // the first one that is not empty
    name:
      [displayName, handle, did].find((value) => !!value)?.slice(0, 255) ?? did,
    scope: tokenSet?.scope,
  };

  const error = appState.linkUserId
    ? await linkToSignedInUser(ctx, appState.linkUserId, profile)
    : await signInWithDid(ctx, profile);
  if (!error) return callbackURL;
  await forgetUnclaimedSession(ctx, did);
  return fail(error);
}

/**
 * callback() has stored an oauth session for the did, but the sign-in or
 * link was refused (has_other_account, signed_out, ...). Unless the did
 * belongs to a user (whose session it now is), nobody will ever use it:
 * revoked at the authorization server and deleted here.
 */
async function forgetUnclaimedSession(
  ctx: EndpointContext,
  did: string,
): Promise<void> {
  try {
    if (await findAtprotoAccount(ctx, did)) return;
  } catch (err) {
    ctx.context.logger.error(
      `[atproto] looking up the account of ${did} failed, its oauth session stays`,
      err,
    );
    return;
  }
  await forgetAtprotoSession(did);
}

function classifyCallbackError(err: unknown): AtprotoErrorCode {
  if (err instanceof OAuthCallbackError) {
    const error = err.params.get("error");
    // the "cancel" / "deny" button on the authorization server
    if (error === "access_denied") return "cancelled";
    if (error) return "denied";
    // redeeming the code failed
    const cause: unknown = err.cause;
    if (
      cause instanceof OAuthResponseError &&
      cause.error === "invalid_grant"
    ) {
      // the code expired or was used already
      return "expired";
    }
    if (cause instanceof OAuthResolverError || cause instanceof FetchError) {
      return "resolve_failed";
    }
  }
  return "server_error";
}

async function readStoredSession(ctx: EndpointContext, did: string) {
  try {
    return await sessionStore.get(did);
  } catch (err) {
    ctx.context.logger.error(
      `[atproto] reading the new oauth session of ${did} failed`,
      err,
    );
    return undefined;
  }
}

interface Profile {
  did: string;
  /** user columns written at every atproto sign-in */
  fields: { did: string; handle?: string | null; contactEmail?: string | null };
  /** display name, else handle, else did: only for new users (or nameless ones) */
  name: string;
  /** the scope the authorization server granted */
  scope: string | undefined;
}

/** (a) known did: sign that user in. (c) new did: create the user first. */
async function signInWithDid(
  ctx: EndpointContext,
  profile: Profile,
): Promise<AtprotoErrorCode | null> {
  const { internalAdapter } = ctx.context;
  let account = await findAtprotoAccount(ctx, profile.did);
  let userId: string;
  if (account) {
    userId = account.userId;
  } else {
    try {
      const created = await internalAdapter.createOAuthUser(
        newUserData(profile),
        {
          providerId: ATPROTO_PROVIDER_ID,
          accountId: profile.did,
          scope: profile.scope,
        },
      );
      userId = created.user.id;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // a concurrent callback for the same did won the race (user.did is
      // unique): sign in as the user it created
      account = await findAtprotoAccount(ctx, profile.did);
      if (!account) {
        // some other unique index: user.did on a user without the account
        // row, or a taken placeholder email
        ctx.context.logger.error(
          `[atproto] creating the user of ${profile.did} hit the unique index ${uniqueViolationConstraint(err) ?? "(unknown)"}`,
          err,
        );
        return "server_error";
      }
      userId = account.userId;
    }
  }
  if (account && profile.scope && account.scope !== profile.scope) {
    await internalAdapter.updateAccount(account.id, { scope: profile.scope });
  }
  // typed as always there, but null when the row is gone
  const user = (await internalAdapter.updateUser(
    userId,
    profile.fields,
  )) as User | null;
  if (!user) {
    ctx.context.logger.error(
      `[atproto] user ${userId} of ${profile.did} is gone`,
    );
    return "server_error";
  }
  const session = await internalAdapter.createSession(user.id);
  await setSessionCookie(ctx, { session, user });
  return null;
}

/** (b) link=1: attach the did to the user who started the sign-in */
async function linkToSignedInUser(
  ctx: EndpointContext,
  linkUserId: string,
  profile: Profile,
): Promise<AtprotoErrorCode | null> {
  const { internalAdapter } = ctx.context;
  // the session must still be the one that asked (re-read, not the cookie cache)
  const current = await getSessionFromCtx(ctx, { disableCookieCache: true });
  if (current?.user.id !== linkUserId) return "signed_out";

  const account = await findAtprotoAccount(ctx, profile.did);
  if (account && account.userId !== linkUserId) return "already_linked";
  const currentDid: unknown = current.user.did;
  if (typeof currentDid === "string" && currentDid !== profile.did) {
    return "has_other_account";
  }

  let user: User | null;
  try {
    // user.did first: its unique index is what stops a race with another link
    user = (await internalAdapter.updateUser(linkUserId, {
      ...profile.fields,
      // people who never picked a name (magic link) get the atproto one
      ...(current.user.name ? {} : { name: profile.name }),
    })) as User | null;
  } catch (err) {
    if (isUniqueViolation(err)) return "already_linked";
    throw err;
  }
  if (!user) return "signed_out";
  if (!account) {
    await internalAdapter.linkAccount({
      userId: linkUserId,
      providerId: ATPROTO_PROVIDER_ID,
      accountId: profile.did,
      scope: profile.scope,
    });
  } else if (profile.scope && account.scope !== profile.scope) {
    await internalAdapter.updateAccount(account.id, { scope: profile.scope });
  }
  // same session, fresh cookie cache (it still holds the user without the did)
  await setSessionCookie(ctx, { session: current.session, user });
  return null;
}

/**
 * The atproto account of a did, looked up by (provider, did) only. Never by
 * email: better-auth's findOAuthUser falls back to the email, and the email a
 * pds reports proves nothing (a self-hosted pds can claim any address).
 */
async function findAtprotoAccount(ctx: EndpointContext, did: string) {
  return ctx.context.adapter.findOne<{
    id: string;
    userId: string;
    scope?: string | null;
  }>({
    model: "account",
    where: [
      { field: "providerId", value: ATPROTO_PROVIDER_ID },
      { field: "accountId", value: did },
    ],
  });
}

function newUserData(profile: Profile) {
  return {
    ...profile.fields,
    name: profile.name,
    email: atprotoPlaceholderEmail(profile.did),
    emailVerified: false,
    // no avatar until images go through our own proxy (no cdn.bsky.app hotlinks)
    image: null,
  };
}

/**
 * better-auth needs a unique email per user; atproto sign-ups get a
 * placeholder at atproto.invalid, which nothing ever delivers to
 * (deliverableEmail in packages/email skips it). It has to be injective:
 * two dids sharing one would lock the second person out on the unique email
 * index. did:plc identifiers are fixed-length lowercase base32, so
 * `did_plc_<id>` is both readable and safe; anything else (did:web, where
 * "." "-" and "%3A" would all collapse into "_") gets the sha-256 of the did.
 */
export function atprotoPlaceholderEmail(did: string): string {
  const domain = `@${ATPROTO_PLACEHOLDER_EMAIL_DOMAIN}`;
  const plc = /^did:plc:([a-z2-7]{24})$/.exec(did);
  if (plc) return `did_plc_${plc[1]}${domain}`;
  return `did_${createHash("sha256").update(did).digest("hex")}${domain}`;
}

// ---------------------------------------------------------------------------
// rate limits
// ---------------------------------------------------------------------------

/**
 * better-auth answers some requests itself, before any plugin code runs: a
 * rate-limited one with a bare 429 (a json body as text/plain), a sign-in
 * post its origin check refuses (an untrusted Origin, a tampered absolute
 * callbackURL) with a json 403. The two atproto endpoints are full-page
 * navigations, so the auth route handler in apps/nextjs runs every request
 * through this, which turns those into the login page with an error
 * (rate_limited, denied). Every other response is returned untouched.
 */
export async function atprotoErrorRedirect(
  request: Request,
  handler: (request: Request) => Promise<Response>,
  options: AtprotoPluginOptions,
): Promise<Response> {
  let path: string | null;
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = null;
  }
  const signIn = path === SIGN_IN_PATH && request.method === "POST";
  // better-auth has read the form by the time its origin check refuses it;
  // the copy keeps the callbackURL (and with it the locale) readable
  const form = signIn ? request.clone() : null;
  const response = await handler(request);
  let code: AtprotoErrorCode;
  if (
    response.status === 429 &&
    (path === SIGN_IN_PATH || path === CALLBACK_PATH)
  ) {
    code = "rate_limited";
  } else if (response.status === 403 && signIn) {
    code = "denied";
  } else {
    return response;
  }
  let requested = "/";
  if (form) {
    try {
      const value = (await form.formData()).get("callbackURL");
      requested = safeCallbackPath(
        typeof value === "string" ? value : undefined,
      );
    } catch {
      // not a form: back to the start page
    }
  }
  const locale = pickLocale(options, {
    callbackURL: requested,
    cookie: readCookie(request.headers.get("cookie"), "NEXT_LOCALE"),
    acceptLanguage: request.headers.get("accept-language"),
  });
  return new Response(null, {
    status: 303,
    headers: {
      location: loginErrorUrl(
        locale,
        code,
        localizedPath(requested, locale, options),
      ),
      "cache-control": "no-store",
    },
  });
}

function readCookie(header: string | null, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function stateCookie(ctx: EndpointContext) {
  return ctx.context.createAuthCookie(STATE_COOKIE, {
    maxAge: STATE_COOKIE_MAX_AGE,
    path: "/api/auth/atproto",
    sameSite: "lax",
    httpOnly: true,
  });
}

function parseAppState(raw: string | undefined): AppState | undefined {
  if (!raw) return undefined;
  try {
    const parsed = appStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function loginErrorUrl(
  locale: string,
  code: AtprotoErrorCode,
  callbackURL: string,
  handle?: string,
): string {
  const params = new URLSearchParams({ error: `atproto_${code}` });
  // the login page's own parameter, so a retry still ends up where it started
  if (callbackURL !== "/" && callbackURL !== `/${locale}`) {
    params.set("callbackUrl", callbackURL);
  }
  if (handle) params.set("handle", handle);
  return `/${locale}/login?${params.toString()}`;
}

/**
 * The person's language for a redirect: the callback path's locale segment,
 * else the NEXT_LOCALE cookie (only set once someone switched languages),
 * else the browser's Accept-Language, else the default.
 */
function pickLocale(
  options: AtprotoPluginOptions,
  hints: {
    callbackURL?: string;
    cookie?: string | null;
    acceptLanguage?: string | null;
  },
): string {
  const segment = hints.callbackURL?.split(/[/?#]/)[1];
  if (segment && options.locales.includes(segment)) return segment;
  if (hints.cookie && options.locales.includes(hints.cookie)) {
    return hints.cookie;
  }
  return (
    negotiateLocale(hints.acceptLanguage, options.locales) ??
    options.defaultLocale
  );
}

/** the first of `locales` in an Accept-Language header, by weight */
function negotiateLocale(
  header: string | null | undefined,
  locales: readonly string[],
): string | undefined {
  if (!header) return undefined;
  return header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return {
        language: tag.trim().toLowerCase().split("-")[0] ?? "",
        weight: Number.isFinite(weight) ? weight : 0,
        index,
      };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .find((entry) => locales.includes(entry.language))?.language;
}

/**
 * A same-origin path with the locale in front when it has none ("/" becomes
 * "/en", "/groups" "/en/groups"): the pages all live under [locale], and the
 * next-intl middleware would otherwise redirect once more, in development to
 * a different host than the one the session cookie was set for.
 */
function localizedPath(
  path: string,
  locale: string,
  options: AtprotoPluginOptions,
): string {
  const segment = path.split(/[/?#]/)[1];
  if (segment && options.locales.includes(segment)) return path;
  return `/${locale}${/^\/(?=[?#]|$)/.test(path) ? path.slice(1) : path}`;
}

/**
 * Same-origin relative paths only, mirroring apps/nextjs/src/lib/callback-url.ts
 * (and better-auth's isSafeRelativeURL): anything else falls back to "/".
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
const ENCODED_PATH_SEPARATOR = /%2[fF]|%5[cC]/;
export function safeCallbackPath(raw: string | undefined): string {
  if (
    !raw?.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    CONTROL_CHARACTERS.test(raw)
  ) {
    return "/";
  }
  try {
    const url = new URL(raw, "http://placeholder.invalid");
    if (
      url.origin !== "http://placeholder.invalid" ||
      ENCODED_PATH_SEPARATOR.test(url.pathname)
    ) {
      return "/";
    }
    const path = `${url.pathname}${url.search}${url.hash}`;
    // dot segments resolve away: "/..//evil.com" comes out as "//evil.com",
    // which a browser reads as another host. So the result is checked again
    if (path.startsWith("//") || path.startsWith("/\\")) return "/";
    // never an endpoint: a callback is where a person lands, and an api
    // route there would act with their cookies
    if (isApiPath(url.pathname)) return "/";
    return path;
  } catch {
    return "/";
  }
}

function isApiPath(pathname: string): boolean {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // keep it encoded
  }
  return /^\/api(?:\/|$)/i.test(decoded);
}

// whitespace, plus the invisible characters that ride along when a handle is
// copied out of an app (bluesky wraps handles in u+202a ... u+202c); the same
// list as apps/nextjs/src/auth-client.ts
const HANDLE_NOISE = /[\s\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

// a handle: dns labels, at least two, the last not starting with a digit
// (the same rule as @atproto-labs/identity-resolver's isValidHandle)
const HANDLE_PATTERN =
  /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * What people type into the field: a handle (with or without "@"), a did, or
 * the https url of their pds / entryway. null when it is none of these, or
 * (unless `allowLocal`, i.e. development) when it points at an ip address or
 * localhost. The oauth client's fetch refuses private addresses anyway; this
 * keeps them from getting that far.
 */
export function normalizeIdentifier(
  raw: string | undefined,
  { allowLocal = false }: { allowLocal?: boolean } = {},
): string | null {
  const value = raw?.replace(HANDLE_NOISE, "");
  if (!value || value.length > 2048) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (allowLocal) return url.origin;
      return url.protocol === "https:" && !isLocalHost(url.hostname)
        ? url.origin
        : null;
    } catch {
      return null;
    }
  }
  const bare = value.replace(/^at:\/\//i, "").replace(/^@+/, "");
  if (isAtprotoDid(bare)) {
    if (!allowLocal && bare.startsWith("did:web:")) {
      // did:web:<host>[%3A<port>]
      const host = bare
        .slice("did:web:".length)
        .replace(/%3A\d+$/i, "")
        .toLowerCase();
      if (isLocalHost(host)) return null;
    }
    return bare;
  }
  const handle = bare.toLowerCase();
  return handle.length < 254 && HANDLE_PATTERN.test(handle) ? handle : null;
}

/** an ip literal, or localhost and its subdomains */
function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.startsWith("[") ||
    host === "localhost" ||
    host.endsWith(".localhost")
  );
}

/** what the person typed, cleaned and capped, to refill the field after an error */
function handleForRetry(raw: string | undefined): string | undefined {
  const value = raw?.replace(HANDLE_NOISE, "").slice(0, 256);
  return value ?? undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function isFlag(value: unknown): boolean {
  const first = firstString(value);
  return first === "1" || first === "true";
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The postgres unique_violation behind an error, possibly wrapped by drizzle
 * or better-auth, with the index it hit; null for any other error.
 */
function uniqueViolation(err: unknown): { constraint?: string } | null {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      current.code === "23505"
    ) {
      const constraint =
        "constraint" in current ? current.constraint : undefined;
      return typeof constraint === "string" ? { constraint } : {};
    }
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  return uniqueViolation(err) !== null;
}

function uniqueViolationConstraint(err: unknown): string | undefined {
  return uniqueViolation(err)?.constraint;
}
