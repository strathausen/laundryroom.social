/* eslint-disable no-restricted-properties */
import { z } from "zod";

import { groupAccountsPublicEnvSchema } from "./env-schema";

const schema = z.object(groupAccountsPublicEnvSchema);

let cached: boolean | undefined;

/**
 * Whether group accounts are on, for the web app: GROUP_PDS_URL and
 * GROUP_HANDLE_DOMAIN are both set and valid. Reads nothing else: the admin
 * password and the credential keys are the worker's alone, and the worker
 * refuses to start while the rest of its config is missing or invalid
 * (apps/worker/src/index.ts), so a deploy with half a config fails instead
 * of running with the feature half on.
 *
 * When off, nothing new is queued for groups without an account and the app
 * behaves as before; groups that already have one still get their changes
 * queued (see packages/api/src/router/group.ts).
 */
export function groupAccountsEnabled(): boolean {
  if (cached === undefined) {
    // empty counts as unset, like createEnv's emptyStringAsUndefined
    const read = (value: string | undefined) =>
      value === "" ? undefined : value;
    const raw = {
      GROUP_PDS_URL: read(process.env.GROUP_PDS_URL),
      GROUP_HANDLE_DOMAIN: read(process.env.GROUP_HANDLE_DOMAIN),
    };
    const parsed = schema.safeParse(raw);
    cached =
      parsed.success &&
      !!parsed.data.GROUP_PDS_URL &&
      !!parsed.data.GROUP_HANDLE_DOMAIN;
    if (!cached && (raw.GROUP_PDS_URL || raw.GROUP_HANDLE_DOMAIN)) {
      console.warn(
        "[group-accounts] off in the web app: GROUP_PDS_URL and GROUP_HANDLE_DOMAIN must both be set and valid",
      );
    }
  }
  return cached;
}
