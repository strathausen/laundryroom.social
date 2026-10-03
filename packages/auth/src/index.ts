import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@laundryroom/db/client";
import {
  Account,
  Session as SessionTable,
  User,
  Verification,
} from "@laundryroom/db/schema";
import { isPlaceholderEmail, sendEmail } from "@laundryroom/email";

import type { AtprotoPluginOptions } from "./atproto/plugin";
import { env } from "../env";
import { atprotoClientMode } from "./atproto/config";
import { atproto, atprotoErrorRedirect } from "./atproto/plugin";
import { authSecret } from "./secret";

export { atprotoLoginStatus } from "./atproto/config";
export { APPVIEW_DID, appviewDid } from "./atproto/did";
export {
  forgetAtprotoSession,
  restoreAtprotoSession,
  type AtprotoSessionResult,
} from "./atproto/client";
export type { AtprotoErrorCode } from "./atproto/plugin";

// keep in sync with apps/nextjs/src/i18n/routing.ts
const ATPROTO_LOCALES: AtprotoPluginOptions = {
  locales: ["de", "en", "es", "fr", "ro"],
  defaultLocale: "en",
};

/**
 * For the auth route handler: runs better-auth's handler, and a rate-limited
 * atproto sign-in or callback, or a sign-in better-auth's origin check
 * refuses, becomes the login page with an error instead of a bare 429 / 403
 * (see atprotoErrorRedirect); any other response passes through.
 */
export function withAtprotoErrorRedirect(
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  return atprotoErrorRedirect(request, handler, ATPROTO_LOCALES);
}

// AUTH_URL is required in production (the standalone server only knows its
// listen address behind the dokku proxy); locally both may be unset, in which
// case better-auth derives the origin from each request.
const baseURL = env.AUTH_URL ?? env.APP_URL;

// Development with a loopback APP_URL (the atproto loopback client): the pages
// run on http://127.0.0.1:<port> (apps/nextjs/src/middleware.ts sends
// localhost there), so their posts carry that origin even when APP_URL says
// localhost.
const atprotoMode = atprotoClientMode();
const devLoopbackOrigin =
  env.NODE_ENV !== "production" && atprotoMode.kind === "loopback"
    ? atprotoMode.loopbackOrigin
    : undefined;

// AUTH_SECRET, or a placeholder while `next build` collects page data (see
// ./secret.ts for why that is keyed to the build phase)
const secret = authSecret;

/**
 * The magic-link email must not point at the verify endpoint directly:
 * corporate link scanners GET every link in an email, and a GET is all it
 * takes to consume the token and mint a session (the ~30k bot sign-ins of
 * 2026). The mail therefore links to an interstitial page in the app
 * (apps/nextjs, /auth/confirm) that only submits the token to the verify
 * endpoint on a human click. better-auth hands us its verify url
 * (`<baseURL>/api/auth/magic-link/verify?token=…&callbackURL=…`); we keep the
 * origin and the query string and only swap the path. The confirm page reads
 * token and callbackURL from it and supplies its own errorCallbackURL.
 */
export function toConfirmUrl(verifyUrl: string) {
  const url = new URL(verifyUrl);
  url.pathname = "/auth/confirm";
  return url.toString();
}

export const auth = betterAuth({
  baseURL,
  secret,
  trustedOrigins: [baseURL, devLoopbackOrigin].filter(
    (origin): origin is string => !!origin,
  ),
  database: drizzleAdapter(db, {
    provider: "pg",
    // better-auth addresses tables by these keys and columns by their object
    // keys (camelCase, see packages/db/src/schema.ts); column names are ours
    schema: {
      user: User,
      session: SessionTable,
      account: Account,
      verification: Verification,
    },
  }),
  socialProviders: {
    google: {
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
    },
  },
  account: {
    // google access/refresh tokens are encrypted at rest with AUTH_SECRET
    encryptOAuthTokens: true,
    accountLinking: {
      // users who signed in with google under next-auth get their account row
      // recreated on the first sign-in after the migration, matched by email.
      // Linking needs the provider to assert the email as verified (google
      // does); listing google under trustedProviders would only waive that
      // check, i.e. let an unverified google identity claim an existing user
      enabled: true,
    },
  },
  user: {
    // written by the atproto sign-in only (input: false keeps them out of
    // better-auth's update-user endpoint); listed here so that getSession and
    // the Session type carry them
    additionalFields: {
      did: { type: "string", required: false, input: false },
      handle: { type: "string", required: false, input: false },
      contactEmail: { type: "string", required: false, input: false },
    },
  },
  advanced: {
    database: {
      // postgres generates the uuids (all four tables default to gen_random_uuid)
      generateId: false,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    cookieCache: {
      // skip the session lookup for 5 minutes after each real check
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  rateLimit: {
    // on by default in production only; we want it in development too
    enabled: true,
    window: 60,
    max: 60,
    // keys are endpoint paths without the /api/auth prefix, per client ip
    // (x-forwarded-for, a single address behind the dokku nginx)
    customRules: {
      "/sign-in/magic-link": { window: 300, max: 3 },
      "/magic-link/verify": { window: 300, max: 10 },
      // every atproto sign-in resolves a handle and pushes a request to the
      // person's authorization server on our behalf. Each callback needs a
      // sign-in, so its limit sits well above (a person who just granted
      // access never hits it); both answer with the login page, not a 429
      // (withAtprotoErrorRedirect)
      "/atproto/sign-in": { window: 60, max: 10 },
      "/atproto/callback": { window: 60, max: 30 },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15, // 15 minutes, matches the email copy
      // sha-256 of the token is what lands in the verification table, so a
      // database read (studio, a dump, query logs) does not yield live sign-ins
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        // atproto sign-ups have a placeholder address nobody can receive
        // mail at (they sign in with their pds); say nothing either way
        if (isPlaceholderEmail(email)) return;
        await sendEmail(email, "magicLink", { confirmUrl: toConfirmUrl(url) });
      },
    }),
    // sign in with an atproto account: /api/auth/atproto/sign-in and
    // /api/auth/atproto/callback (./atproto/plugin.ts)
    atproto(ATPROTO_LOCALES),
    // has to be last: copies set-cookie headers onto next's cookie store so
    // server actions and route handlers can sign in / out
    nextCookies(),
  ],
});

/** `{ session, user }` as returned by `getSession`, or null when signed out */
export type Session = typeof auth.$Infer.Session;

/**
 * Resolve the session for a request from its cookies. Route handlers and the
 * tRPC context pass the incoming request's headers; server components pass
 * `await headers()` from next/headers (a promise since next 15).
 */
export function getSession(headers: Headers): Promise<Session | null> {
  return auth.api.getSession({ headers });
}
