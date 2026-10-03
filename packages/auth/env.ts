/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// public origin, no trailing slash so it can be concatenated
const origin = z
  .string()
  .url()
  .transform((url) => url.replace(/\/+$/, ""));

export const env = createEnv({
  server: {
    AUTH_GOOGLE_ID: z.string().min(1),
    AUTH_GOOGLE_SECRET: z.string().min(1),
    // Signs session cookies and the cookie cache. Better Auth refuses to start
    // with its built-in default secret in production, hence required there.
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(1)
        : z.string().min(1).optional(),
    // Public origin Better Auth uses for its absolute urls (google callback,
    // the magic-link confirm link) and as its trusted origin. The standalone
    // server reports its listen address (0.0.0.0:3000) as the request origin,
    // so behind the dokku proxy it has to be set; locally it falls back to
    // APP_URL and, when that is unset too, to the origin of each request
    // (`next dev` listens on localhost, where that is right).
    AUTH_URL:
      process.env.NODE_ENV === "production" ? origin : origin.optional(),
    APP_URL: origin.optional(),
    // ES256 private key (a JWK as a JSON string, kid "k1") the atproto oauth
    // client signs its token requests with (private_key_jwt). Setting it turns
    // on atproto sign-in for a public https APP_URL; on a loopback APP_URL
    // (localhost / 127.0.0.1) the keyless loopback client is used instead and
    // this is ignored. Read lazily on the first atproto request, never at build
    // time. Generate one with the node one-liner in .env.example.
    ATPROTO_OAUTH_PRIVATE_JWK: z.string().min(1).optional(),
    // PDS (or entryway) that hosts "create an account" sign-ups via
    // prompt=create, e.g. https://lndry.me. Unset hides the sign-up button.
    ATPROTO_SIGNUP_PDS_URL: origin.optional(),
    // Development only (ignored when NODE_ENV is production or APP_URL is not
    // a loopback origin): run the atproto sign-in against a local network such
    // as @atproto/dev-env instead of the real one. The plc directory to
    // resolve did:plc with, a pds/appview url that answers
    // com.atproto.identity.resolveHandle, and the appview for display names.
    // Setting any of them also allows plain-http pdses and turns off the ssrf
    // filter of the oauth client.
    ATPROTO_DEV_PLC_URL: origin.optional(),
    ATPROTO_DEV_HANDLE_RESOLVER: origin.optional(),
    ATPROTO_DEV_PUBLIC_APPVIEW: origin.optional(),
    NODE_ENV: z.enum(["development", "production"]).optional(),
    RESEND_KEY: z.string().min(1),
  },
  client: {},
  experimental__runtimeEnv: {},
  skipValidation:
    !!process.env.CI ||
    !!process.env.SKIP_ENV_VALIDATION ||
    process.env.npm_lifecycle_event === "lint",
});
