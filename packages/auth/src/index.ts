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
import { sendEmail } from "@laundryroom/email";

import { env } from "../env";

// AUTH_URL is required in production (the standalone server only knows its
// listen address behind the dokku proxy); locally both may be unset, in which
// case better-auth derives the origin from each request.
const baseURL = env.AUTH_URL ?? env.APP_URL;

// `next build` evaluates every route module that imports this file while it
// collects page data, and the docker image is built with NODE_ENV=production
// but without secrets (SKIP_ENV_VALIDATION=1, like packages/db/src/client.ts).
// better-auth validates the secret while it initialises and rejects its
// context promise when the default one is used in production, an unhandled
// rejection that kills the build worker. The placeholder is therefore keyed
// to the build phase itself (next sets NEXT_PHASE in the build process and
// its page-data workers inherit it), not to SKIP_ENV_VALIDATION: that switch
// also disables the env schema, so a `dokku config:set SKIP_ENV_VALIDATION=1`
// at runtime would otherwise let a string from the public repo sign session
// cookies. Outside the build, production fails loudly instead.
// eslint-disable-next-line no-restricted-properties
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
if (!env.AUTH_SECRET && env.NODE_ENV === "production" && !isBuild) {
  throw new Error("AUTH_SECRET is required in production");
}
const secret =
  env.AUTH_SECRET ??
  (isBuild ? "build-time-placeholder-secret-never-used-at-runtime" : undefined);

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
  trustedOrigins: baseURL ? [baseURL] : [],
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
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15, // 15 minutes, matches the email copy
      // sha-256 of the token is what lands in the verification table, so a
      // database read (studio, a dump, query logs) does not yield live sign-ins
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        await sendEmail(email, "magicLink", { confirmUrl: toConfirmUrl(url) });
      },
    }),
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
