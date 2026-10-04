/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-core";

import { groupAccountsEnvSchema } from "./src/env-schema";

/**
 * Group accounts on pds.lndry.social (docs/atproto-plan.md, phase 3), the
 * worker's view: every GROUP_* variable, secrets included. Every variable is
 * optional; the feature is on only when all of GROUP_PDS_URL,
 * GROUP_HANDLE_DOMAIN, GROUP_PDS_ADMIN_PASSWORD, GROUP_EMAIL_DOMAIN and one
 * credential key are set (see src/config.ts). The web app never imports
 * this: it reads only the two public variables (src/enabled.ts).
 */
export const env = createEnv({
  server: groupAccountsEnvSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation:
    !!process.env.CI ||
    !!process.env.SKIP_ENV_VALIDATION ||
    process.env.npm_lifecycle_event === "lint",
});
