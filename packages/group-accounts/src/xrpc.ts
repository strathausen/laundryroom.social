import type { Agent } from "@atproto/lex";
import type { z } from "zod";

/**
 * A small xrpc client on plain fetch + zod, in the style of
 * packages/auth/src/atproto/identity.ts: the group pds is ours and only a
 * dozen stable com.atproto.* methods are called. Errors never carry request
 * bodies (they hold passwords) or headers (they hold tokens).
 */

/** How long one call may take before it counts as a network failure. */
const TIMEOUT_MS = 30_000;
/**
 * The largest response body read. Every answer we use is a few kilobytes
 * (sessions, records, a blob ref); anything bigger is not from a pds we
 * should trust.
 */
const MAX_RESPONSE_BYTES = 256 * 1024;

/** An error response from the pds (`{ error, message }`). */
export class XrpcError extends Error {
  override readonly name = "XrpcError";

  constructor(
    readonly method: string,
    readonly status: number,
    /** the xrpc error name, e.g. HandleNotAvailable or ExpiredToken */
    readonly error: string | undefined,
    message: string | undefined,
  ) {
    super(
      `${method} answered ${status}${error ? ` ${error}` : ""}${message ? `: ${message}` : ""}`,
    );
  }

  /** rate limits and server-side trouble pass; everything else will not */
  get retryable(): boolean {
    return this.status === 429 || this.status === 408 || this.status >= 500;
  }
}

/** The pds could not be reached, or did not answer in time. Retryable. */
export class XrpcNetworkError extends Error {
  override readonly name = "XrpcNetworkError";
  readonly retryable = true;

  constructor(
    readonly method: string,
    options?: { cause?: unknown },
  ) {
    super(`${method} failed: the pds did not answer`, options);
  }
}

/** A response that does not have the shape we expect. Not retryable. */
export class XrpcResponseError extends Error {
  override readonly name = "XrpcResponseError";
}

export type XrpcBody =
  | { json: unknown }
  /** pre-serialised json, e.g. a record from lexStringify */
  | { jsonText: string }
  | { bytes: Uint8Array; mimeType: string };

export interface XrpcCall<T> {
  method: string;
  /** query (GET) or procedure (POST) */
  type: "query" | "procedure";
  params?: Record<string, string | undefined>;
  body?: XrpcBody;
  /** the response body; omit for methods without output */
  output?: z.ZodType<T, z.ZodTypeDef, unknown>;
  signal?: AbortSignal;
}

/**
 * Calls `method` through `agent` (which adds the origin and auth). Resolves
 * to the parsed output, or undefined for methods without one.
 */
export async function xrpc<T = undefined>(
  agent: Agent,
  call: XrpcCall<T>,
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(call.params ?? {})) {
    if (value !== undefined) query.set(key, value);
  }
  const search = query.toString();
  const path = `/xrpc/${call.method}${search ? `?${search}` : ""}` as const;

  const headers: Record<string, string> = { accept: "application/json" };
  let body: string | Uint8Array | undefined;
  if (call.body && "json" in call.body) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(call.body.json);
  } else if (call.body && "jsonText" in call.body) {
    headers["content-type"] = "application/json";
    body = call.body.jsonText;
  } else if (call.body) {
    headers["content-type"] = call.body.mimeType;
    body = call.body.bytes;
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await agent.fetchHandler(path, {
      method: call.type === "query" ? "GET" : "POST",
      headers,
      body,
      signal: call.signal ? AbortSignal.any([call.signal, timeout]) : timeout,
      redirect: "error",
    });
  } catch (err) {
    if (err instanceof XrpcError) throw err;
    throw new XrpcNetworkError(call.method, { cause: err });
  }

  if (!res.ok) {
    let error: string | undefined;
    let message: string | undefined;
    try {
      const parsed = JSON.parse(await readCapped(res, call.method)) as {
        error?: unknown;
        message?: unknown;
      };
      if (typeof parsed.error === "string") error = parsed.error;
      // a pds message is a sentence; cut anything longer
      if (typeof parsed.message === "string") {
        message = parsed.message.slice(0, 300);
      }
    } catch {
      // not json, or too big: the status says enough
    }
    throw new XrpcError(call.method, res.status, error, message);
  }

  if (!call.output) {
    // drain the body so the connection can be reused
    await readCapped(res, call.method).catch(() => undefined);
    return undefined as T;
  }
  let json: unknown;
  try {
    json = JSON.parse(await readCapped(res, call.method));
  } catch (err) {
    if (err instanceof XrpcResponseError || err instanceof XrpcNetworkError) {
      throw err;
    }
    throw new XrpcResponseError(`${call.method} answered with invalid json`);
  }
  const parsed = call.output.safeParse(json);
  if (!parsed.success) {
    // the issue paths only: a response may hold tokens
    throw new XrpcResponseError(
      `${call.method} answered an unexpected shape (${parsed.error.issues
        .map((issue) => issue.path.join(".") || "$")
        .join(", ")})`,
    );
  }
  return parsed.data;
}

/**
 * The body as text, at most MAX_RESPONSE_BYTES; a bigger one is cancelled
 * and refused (XrpcResponseError, not retried).
 */
async function readCapped(res: Response, method: string): Promise<string> {
  if (!res.body) return "";
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) {
    await res.body.cancel();
    throw new XrpcResponseError(
      `${method} answered with a body that is too big`,
    );
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    // leaving the loop early cancels the rest of the body
    for await (const chunk of res.body as ReadableStream<Uint8Array>) {
      total += chunk.length;
      if (total > MAX_RESPONSE_BYTES) break;
      chunks.push(chunk);
    }
  } catch (err) {
    // the connection broke mid-body
    throw new XrpcNetworkError(method, { cause: err });
  }
  if (total > MAX_RESPONSE_BYTES) {
    throw new XrpcResponseError(
      `${method} answered with a body that is too big`,
    );
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * An agent for `service` that adds `headers` to every request. Used for the
 * unauthenticated calls (createAccount, createSession), the admin call and,
 * wrapped with a session, for everything else.
 */
export function serviceAgent(
  service: string,
  headers: () => Record<string, string> | Promise<Record<string, string>>,
  fetchImpl: typeof fetch = fetch,
): Agent {
  return {
    fetchHandler: async (path, init) => {
      const merged = new Headers(init.headers);
      for (const [name, value] of Object.entries(await headers())) {
        merged.set(name, value);
      }
      return fetchImpl(new URL(path, service), { ...init, headers: merged });
    },
  };
}
