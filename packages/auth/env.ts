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
