import { env } from "../env";

// `next build` evaluates every route module that imports this package while it
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
export const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (!env.AUTH_SECRET && env.NODE_ENV === "production" && !isBuildPhase) {
  throw new Error("AUTH_SECRET is required in production");
}

/**
 * The secret handed to better-auth: AUTH_SECRET, the build placeholder, or
 * undefined in development without AUTH_SECRET (better-auth then falls back
 * to its built-in development secret and warns).
 */
export const authSecret =
  env.AUTH_SECRET ??
  (isBuildPhase
    ? "build-time-placeholder-secret-never-used-at-runtime"
    : undefined);

// better-auth's own fallback (DEFAULT_SECRET in better-auth/dist/utils/constants),
// which it refuses in production. Only ever used in development, where
// AUTH_SECRET may be unset.
const DEVELOPMENT_SECRET = "better-auth-secret-12345678901234567890";

/**
 * Key for data we encrypt at rest ourselves (the atproto oauth stores):
 * AUTH_SECRET, like better-auth's encrypted oauth tokens. Rotating
 * AUTH_SECRET therefore also forgets every stored atproto oauth session, and
 * those people sign in with their PDS again.
 */
export function encryptionSecret(): string {
  return authSecret ?? DEVELOPMENT_SECRET;
}
