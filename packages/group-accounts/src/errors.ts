import { RecordValidationError } from "@laundryroom/atproto";

import { CredentialDecryptError } from "./cipher";
import { XrpcError, XrpcNetworkError, XrpcResponseError } from "./xrpc";

/** A failure of a group account operation that says whether to retry. */
export class GroupAccountError extends Error {
  override readonly name = "GroupAccountError";
  readonly permanent: boolean;
  /**
   * A credential problem (none stored, refused, does not decrypt): retrying
   * cannot help, recovering the credential can (recover-group-credential).
   */
  readonly credential: boolean;

  constructor(
    message: string,
    options: { permanent: boolean; credential?: boolean; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.permanent = options.permanent;
    this.credential = options.credential ?? false;
  }
}

/**
 * Whether retrying cannot help: a record that does not fit its lexicon, a
 * credential that does not decrypt or is refused, a request the pds rejects
 * as invalid, a response we do not understand. The jobs give up on these
 * loudly instead of retrying. Network trouble, rate limits, pds errors (5xx)
 * and database errors are retried with backoff.
 */
export function isPermanentGroupAccountError(err: unknown): boolean {
  if (err instanceof GroupAccountError) return err.permanent;
  if (err instanceof RecordValidationError) return true;
  if (err instanceof CredentialDecryptError) return true;
  if (err instanceof XrpcResponseError) return true;
  if (err instanceof XrpcError) return !err.retryable;
  if (err instanceof XrpcNetworkError) return false;
  return false;
}

/** Whether `err` is a problem with the group's stored credential. */
export function isCredentialError(err: unknown): boolean {
  return (
    err instanceof CredentialDecryptError ||
    (err instanceof GroupAccountError && err.credential)
  );
}

// ---------------------------------------------------------------------------
// what may be logged

/** Values that must never appear in a log line (the admin password, …). */
const secretValues = new Set<string>();

/** Adds values describeError blanks out wherever they turn up. */
export function redactInLogs(values: readonly (string | undefined)[]): void {
  for (const value of values) {
    if (value && value.length >= 4) secretValues.add(value);
  }
}

const REDACTIONS: [RegExp, string][] = [
  // a sealed credential (cipher.ts): v1.<iv>.<body>
  [/\bv1\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[sealed]"],
  // jwts (session tokens)
  [/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[jwt]"],
  // authorization header values
  [/\b(Basic|Bearer)\s+[A-Za-z0-9+/=._-]+/g, "$1 [redacted]"],
];

function redact(text: string): string {
  let out = text;
  for (const value of secretValues) out = out.split(value).join("[redacted]");
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

const field = (value: unknown, name: string): string | undefined => {
  if (typeof value !== "object" || value === null || !(name in value)) {
    return undefined;
  }
  const found = (value as Record<string, unknown>)[name];
  return typeof found === "string" ? found : undefined;
};

/** A drizzle query error: its message holds the query and its parameters. */
function isQueryError(err: Error): boolean {
  return "params" in err && typeof field(err, "query") === "string";
}

/** A node-postgres server error (code, severity; detail may hold values). */
function isPgError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /^[0-9A-Z]{5}$/.test(field(err, "code") ?? "") &&
    typeof field(err, "severity") === "string"
  );
}

function describePg(err: Error): string {
  // the message names constraints and tables, never values (detail does)
  return `database error ${field(err, "code")}: ${err.message}`;
}

/**
 * One line about `err` that is safe to log and to store in pgboss.job: no
 * request parameters (drizzle puts them, encrypted credentials included,
 * into its error message), no causes from fetch (an invalid header error
 * quotes the header), no tokens, and none of the values given to
 * redactInLogs.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return "a non-error was thrown";
  if (
    err instanceof GroupAccountError ||
    err instanceof XrpcError ||
    err instanceof XrpcResponseError ||
    err instanceof CredentialDecryptError ||
    err instanceof RecordValidationError
  ) {
    return redact(`${err.name}: ${err.message}`);
  }
  if (err instanceof XrpcNetworkError) {
    const cause = err.cause;
    const code =
      field(cause, "code") ??
      field(cause instanceof Error ? cause.cause : undefined, "code");
    const name = cause instanceof Error ? cause.name : undefined;
    return redact(
      `${err.name}: ${err.message}${name ? ` (${name}${code ? ` ${code}` : ""})` : ""}`,
    );
  }
  if (isQueryError(err)) {
    return isPgError(err.cause)
      ? describePg(err.cause as Error)
      : "database error (query failed)";
  }
  if (isPgError(err)) return describePg(err);
  if (err.name === "AbortError" || err.name === "TimeoutError") {
    return `${err.name}: ${redact(err.message)}`;
  }
  // a bug: keep the stack, redacted
  return redact(err.stack ?? `${err.name}: ${err.message}`);
}

/**
 * An Error carrying only describeError's line, for rethrowing to pg-boss:
 * it logs the error and stores it in the job's output, cause and own
 * properties included.
 */
export function sanitizedError(err: unknown): Error {
  const safe = new Error(describeError(err));
  safe.name = "GroupAccountJobError";
  return safe;
}
