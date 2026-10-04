import { z } from "zod";

import type { GroupAccountsEnvName } from "./env-schema";
import { env as validatedEnv } from "../env";
import { groupAccountsEnvNames, groupAccountsEnvSchema } from "./env-schema";

/** Everything LocalPdsGroupHost needs, all present and valid. Worker only. */
export interface GroupAccountsConfig {
  /** e.g. https://pds.lndry.social, no trailing slash */
  pdsUrl: string;
  /** e.g. lndry.social */
  handleDomain: string;
  adminPassword: string;
  /** e.g. lndry.social: account emails are groups+<slug>@<emailDomain> */
  emailDomain: string;
  /** the credential keys by slot; slot 2 is the newer one while rotating */
  credentialKeys: { 1?: Buffer; 2?: Buffer };
  rateLimitBypassKey?: string;
  /** where new dids are checked, no trailing slash */
  plcUrl: string;
}

/** The variables that must all be set (plus one credential key). */
const REQUIRED = [
  "GROUP_PDS_URL",
  "GROUP_HANDLE_DOMAIN",
  "GROUP_PDS_ADMIN_PASSWORD",
  "GROUP_EMAIL_DOMAIN",
] as const;

const DEFAULT_PLC_URL = "https://plc.directory";

export type GroupAccountsEnv = Partial<
  Record<GroupAccountsEnvName, string | undefined>
>;

export type ReadConfigResult =
  | { config: GroupAccountsConfig; missing: []; invalid: [] }
  | { config: null; missing: string[]; invalid: string[] };

const schema = z.object(groupAccountsEnvSchema);

/** Whether `domain` is `parent` or a subdomain of it. */
function isAtOrUnder(domain: string, parent: string): boolean {
  return domain === parent || domain.endsWith(`.${parent}`);
}

/**
 * Reads the config from `source` (the validated env by default). The values
 * are parsed again here, because createEnv does not validate under
 * SKIP_ENV_VALIDATION, CI or lint. `missing` and `invalid` hold variable
 * names only, never values: some of them are secrets.
 */
export function readGroupAccountsConfig(
  source: GroupAccountsEnv = validatedEnv,
): ReadConfigResult {
  // empty strings count as unset, like createEnv's emptyStringAsUndefined
  const raw = Object.fromEntries(
    groupAccountsEnvNames.map((name) => {
      const value = source[name];
      return [name, value === "" ? undefined : value];
    }),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const invalid = [
      ...new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
    ];
    return { config: null, missing: [], invalid };
  }
  const values = parsed.data;
  const missing: string[] = REQUIRED.filter((name) => !values[name]);
  if (!values.GROUP_CREDENTIAL_KEY_1 && !values.GROUP_CREDENTIAL_KEY_2) {
    missing.push("GROUP_CREDENTIAL_KEY_1");
  }
  if (
    missing.length > 0 ||
    !values.GROUP_PDS_URL ||
    !values.GROUP_HANDLE_DOMAIN ||
    !values.GROUP_PDS_ADMIN_PASSWORD ||
    !values.GROUP_EMAIL_DOMAIN
  ) {
    return { config: null, missing, invalid: [] };
  }
  // whoever reads the mailbox of an account's email can reset its password
  // (requestPasswordReset needs no auth): only a domain under our own
  // handle domain, never someone else's mail service
  if (!isAtOrUnder(values.GROUP_EMAIL_DOMAIN, values.GROUP_HANDLE_DOMAIN)) {
    return { config: null, missing: [], invalid: ["GROUP_EMAIL_DOMAIN"] };
  }
  const key = (value: string | undefined) =>
    value ? Buffer.from(value, "base64") : undefined;
  return {
    config: {
      pdsUrl: values.GROUP_PDS_URL,
      handleDomain: values.GROUP_HANDLE_DOMAIN,
      adminPassword: values.GROUP_PDS_ADMIN_PASSWORD,
      emailDomain: values.GROUP_EMAIL_DOMAIN,
      credentialKeys: {
        1: key(values.GROUP_CREDENTIAL_KEY_1),
        2: key(values.GROUP_CREDENTIAL_KEY_2),
      },
      rateLimitBypassKey: values.GROUP_PDS_RATE_LIMIT_BYPASS_KEY,
      plcUrl: values.GROUP_PLC_URL ?? DEFAULT_PLC_URL,
    },
    missing: [],
    invalid: [],
  };
}

let cached: ReadConfigResult | undefined;

/**
 * Why group accounts cannot run although some GROUP_* variable is set
 * (names only, never values), or null: either the config is complete, or
 * nothing is set at all (the feature is simply off). The worker refuses to
 * start on a problem, so a typo, a malformed rotation key or half a config
 * fails the deploy instead of quietly turning the feature off while groups
 * with accounts keep publishing.
 */
export function groupAccountsConfigProblem(
  source: GroupAccountsEnv = validatedEnv,
): string | null {
  const result =
    source === validatedEnv ? configResult() : readGroupAccountsConfig(source);
  if (result.config) return null;
  const anySet = groupAccountsEnvNames.some((name) => !!source[name]);
  if (!anySet && result.invalid.length === 0) return null;
  return [
    result.missing.length > 0 ? `missing ${result.missing.join(", ")}` : "",
    result.invalid.length > 0 ? `invalid ${result.invalid.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function configResult(): ReadConfigResult {
  cached ??= readGroupAccountsConfig();
  return cached;
}

/**
 * The config of this process, or null when group accounts are off (or
 * misconfigured: see groupAccountsConfigProblem, which the worker checks
 * when it starts).
 */
export function groupAccountsConfig(): GroupAccountsConfig | null {
  return configResult().config;
}
