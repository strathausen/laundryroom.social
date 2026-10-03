// no "use client": the login and profile pages (server components) import
// these values, and a client module would hand them a reference instead

/**
 * failed atproto sign-ins and links come back as
 * /<locale>/login?error=atproto_<code> (packages/auth, atproto plugin).
 * each code has a message under `atproto.errors.<code>` in messages/*.json.
 */
const ATPROTO_ERROR_CODES = [
  "invalid_handle",
  "resolve_failed",
  "cancelled",
  "denied",
  "expired",
  "signed_out",
  "already_linked",
  "has_other_account",
  "rate_limited",
  "server_error",
] as const;

/** codes that are about the handle itself: the field gets marked invalid */
const HANDLE_ERROR_CODES = new Set(["invalid_handle", "resolve_failed"]);

type AtprotoErrorKey = (typeof ATPROTO_ERROR_CODES)[number] | "generic";

const PREFIX = "atproto_" as const;

/** any `?error=` value that came out of the atproto plugin, known or not */
export function isAtprotoError(
  code: string | undefined,
): code is `${typeof PREFIX}${string}` {
  return !!code?.startsWith(PREFIX);
}

/**
 * message key (relative to the `atproto` namespace) for an `?error=` value.
 * unknown codes get the generic message: never echo the code itself, anyone
 * can put text into ?error= and it would show up on a real page.
 */
export function atprotoErrorKey(code: string): `errors.${AtprotoErrorKey}` {
  const key = code.slice(PREFIX.length);
  const known = (ATPROTO_ERROR_CODES as readonly string[]).includes(key);
  return `errors.${known ? (key as AtprotoErrorKey) : "generic"}`;
}

/** whether an `?error=` value says the typed handle is wrong (not found, not a handle) */
export function isAtprotoHandleError(code: string): boolean {
  return HANDLE_ERROR_CODES.has(code.slice(PREFIX.length));
}
