/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Discord provider is currently disabled in config.ts
    AUTH_DISCORD_ID: z.string().min(1).optional(),
    AUTH_DISCORD_SECRET: z.string().min(1).optional(),
    AUTH_GOOGLE_ID: z.string().min(1),
    AUTH_GOOGLE_SECRET: z.string().min(1),
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(1)
        : z.string().min(1).optional(),
    // The standalone server reports its listen address (0.0.0.0:3000) as the
    // request origin, so behind the dokku proxy Auth.js needs the public url
    // for oauth / magic-link callbacks. `next dev` listens on localhost, where
    // the inferred origin is right, hence optional outside production.
    AUTH_URL:
      process.env.NODE_ENV === "production"
        ? z.string().url()
        : z.string().url().optional(),
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
