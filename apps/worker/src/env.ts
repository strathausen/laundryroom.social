/* eslint-disable no-restricted-properties */
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Validated when the worker boots, never skipped: unlike the web app there is
// no build step that evaluates this module (esbuild only bundles it).
export const env = createEnv({
  server: {
    // read by @laundryroom/jobs; checked here so a missing url fails with
    // the list of what is wrong before pg-boss tries to connect
    POSTGRES_URL: z.string().min(1),
    // When the heartbeat job fires (cron, UTC). Only worth overriding to see
    // a scheduled run sooner locally, e.g. "* * * * *".
    WORKER_HEARTBEAT_CRON: z.string().min(1).default("*/15 * * * *"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
