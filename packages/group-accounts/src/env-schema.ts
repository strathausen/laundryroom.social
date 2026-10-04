import { z } from "zod";

/**
 * The GROUP_* variables of group accounts on pds.lndry.social
 * (docs/atproto-plan.md, phase 3), as zod schemas, without reading anything.
 * Every variable is optional; what each one is for is documented in
 * .env.example. Both entry points parse with these:
 *
 * - the web app (src/enabled.ts) reads only GROUP_PDS_URL and
 *   GROUP_HANDLE_DOMAIN, which say whether the feature is on and are not
 *   secret. It never reads the admin password or the credential keys.
 * - the worker (src/config.ts) reads all of them.
 *
 * Parsed again at runtime because createEnv skips validation under
 * SKIP_ENV_VALIDATION, CI and lint, and a malformed key or a plain-http pds
 * url must never be used anyway.
 */

/** a dns name of two or more labels, lowercased, without a leading dot */
export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^\.+/, ""))
  .pipe(
    z
      .string()
      .max(253)
      .regex(
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/,
        "must be a domain such as lndry.social",
      ),
  );

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * an origin, no trailing slash. https, except a loopback host (a local
 * @atproto/dev-env): the passwords travel in these requests
 */
export const serviceOriginSchema = z
  .string()
  .url()
  .transform((value) => value.replace(/\/+$/, ""))
  .refine((value) => {
    // zod runs this even after .url() failed
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname))
    );
  }, "must be an https url (plain http only for localhost)");

/** 32 random bytes, base64: `openssl rand -base64 32` */
const credentialKey = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^[A-Za-z0-9+/]+={0,2}$/.test(value) &&
      Buffer.from(value, "base64").length === 32,
    "must be 32 bytes, base64 encoded (openssl rand -base64 32)",
  );

/**
 * a value sent as a raw http header: visible ascii only, so an invalid
 * header can never make fetch throw an error that quotes it
 */
const headerToken = z
  .string()
  .regex(
    /^[\x21-\x7e]+$/,
    "must be visible ascii (e.g. openssl rand --hex 32)",
  );

/** The two variables that say whether the feature is on; not secret. */
export const groupAccountsPublicEnvSchema = {
  /** the group pds, e.g. https://pds.lndry.social */
  GROUP_PDS_URL: serviceOriginSchema.optional(),
  /** the handle domain of group accounts, e.g. lndry.social */
  GROUP_HANDLE_DOMAIN: domainSchema.optional(),
};

/** Every variable; the worker's. */
export const groupAccountsEnvSchema = {
  ...groupAccountsPublicEnvSchema,
  /**
   * the group pds's admin password: single-use invite codes, and the
   * recovery and takedown of group accounts. worker only
   */
  GROUP_PDS_ADMIN_PASSWORD: z.string().min(1).optional(),
  /** aes-256-gcm key for the stored group passwords. worker only */
  GROUP_CREDENTIAL_KEY_1: credentialKey.optional(),
  /** the rotation slot: when set, new secrets are encrypted with it */
  GROUP_CREDENTIAL_KEY_2: credentialKey.optional(),
  /**
   * account emails are groups+<slug>@<this domain>; it must be the handle
   * domain or a subdomain of it (see config.ts)
   */
  GROUP_EMAIL_DOMAIN: domainSchema.optional(),
  /** sent as x-ratelimit-bypass to the group pds, only when set */
  GROUP_PDS_RATE_LIMIT_BYPASS_KEY: headerToken.optional(),
  /** where new group dids are checked; https://plc.directory by default */
  GROUP_PLC_URL: serviceOriginSchema.optional(),
};

export type GroupAccountsEnvName = keyof typeof groupAccountsEnvSchema;
export const groupAccountsEnvNames = Object.keys(
  groupAccountsEnvSchema,
) as GroupAccountsEnvName[];
