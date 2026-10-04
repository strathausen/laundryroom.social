import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Agent } from "@atproto/lex";
import { z } from "zod";

import { RecordValidationError } from "@laundryroom/atproto";

import { CredentialDecryptError } from "./cipher";
import { GroupAccountError, isPermanentGroupAccountError } from "./errors";
import { isHandleRefusal } from "./local-pds-group-host";
import { xrpc, XrpcError, XrpcNetworkError, XrpcResponseError } from "./xrpc";

/** An agent answering every request with `respond`, recording the requests. */
function fakeAgent(
  respond: (path: string, init: RequestInit) => Response | Promise<Response>,
) {
  const calls: { path: string; init: RequestInit }[] = [];
  const agent: Agent = {
    fetchHandler: async (path, init) => {
      calls.push({ path, init });
      return respond(path, init);
    },
  };
  return { agent, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("xrpc", () => {
  it("sends queries as GET with params and procedures as POST with json", async () => {
    const { agent, calls } = fakeAgent(() => json(200, { ok: true }));
    await xrpc(agent, {
      method: "com.atproto.repo.getRecord",
      type: "query",
      params: { repo: "did:plc:x", rkey: "self", cid: undefined },
      output: z.object({ ok: z.boolean() }),
    });
    await xrpc(agent, {
      method: "com.atproto.server.createSession",
      type: "procedure",
      body: { json: { identifier: "a", password: "secret" } },
    });
    const [query, procedure] = calls;
    assert.ok(query && procedure);
    assert.equal(
      query.path,
      "/xrpc/com.atproto.repo.getRecord?repo=did%3Aplc%3Ax&rkey=self",
    );
    assert.equal(query.init.method, "GET");
    assert.equal(procedure.init.method, "POST");
    assert.equal(
      new Headers(procedure.init.headers).get("content-type"),
      "application/json",
    );
  });

  it("turns error responses into XrpcErrors without the request body", async () => {
    const { agent } = fakeAgent(() =>
      json(400, { error: "HandleNotAvailable", message: "Reserved handle" }),
    );
    await assert.rejects(
      xrpc(agent, {
        method: "com.atproto.server.createAccount",
        type: "procedure",
        body: { json: { password: "do-not-log-me" } },
      }),
      (err: unknown) =>
        err instanceof XrpcError &&
        err.status === 400 &&
        err.error === "HandleNotAvailable" &&
        !err.retryable &&
        !err.message.includes("do-not-log-me"),
    );
  });

  it("calls rate limits and server errors retryable", () => {
    assert.ok(
      new XrpcError("m", 429, "RateLimitExceeded", undefined).retryable,
    );
    assert.ok(new XrpcError("m", 502, undefined, undefined).retryable);
    assert.ok(
      !new XrpcError("m", 401, "AuthenticationRequired", undefined).retryable,
    );
  });

  it("turns a failed fetch into a retryable network error", async () => {
    const { agent } = fakeAgent(() => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(
      xrpc(agent, { method: "m.x.y", type: "query" }),
      (err: unknown) => err instanceof XrpcNetworkError && err.retryable,
    );
  });

  it("refuses a response body that is too big, without reading it all", async () => {
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024).fill(32);
    const { agent } = fakeAgent(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulled++;
              controller.enqueue(chunk);
            },
          }),
          { status: 200 },
        ),
    );
    await assert.rejects(
      xrpc(agent, {
        method: "m.x.y",
        type: "query",
        output: z.object({}),
      }),
      (err: unknown) =>
        err instanceof XrpcResponseError && err.message.includes("too big"),
    );
    assert.ok(pulled < 10);
  });

  it("reports an unexpected response by path, not by value", async () => {
    const { agent } = fakeAgent(() =>
      json(200, { accessJwt: 42, secret: "tok" }),
    );
    await assert.rejects(
      xrpc(agent, {
        method: "m.x.y",
        type: "procedure",
        output: z.object({ accessJwt: z.string() }),
      }),
      (err: unknown) =>
        err instanceof XrpcResponseError &&
        err.message.includes("accessJwt") &&
        !err.message.includes("42") &&
        !err.message.includes("tok"),
    );
  });
});

describe("isHandleRefusal", () => {
  it("is true for taken, reserved and refused handles and taken emails", () => {
    const refusals = [
      new XrpcError("m", 400, "HandleNotAvailable", "Reserved handle"),
      new XrpcError(
        "m",
        400,
        "InvalidHandle",
        "Inappropriate language in handle",
      ),
      new XrpcError(
        "m",
        400,
        "InvalidRequest",
        "Handle already taken: foo.lndry.social",
      ),
      new XrpcError(
        "m",
        400,
        "InvalidRequest",
        "Email already taken: groups+foo@lndry.social",
      ),
    ];
    for (const err of refusals) assert.ok(isHandleRefusal(err), err.message);
  });

  it("is false for config errors and everything else", () => {
    const others = [
      new XrpcError(
        "m",
        400,
        "UnsupportedDomain",
        "Not a supported handle domain",
      ),
      new XrpcError(
        "m",
        400,
        "InvalidInviteCode",
        "Provided invite code not available",
      ),
      new XrpcError(
        "m",
        400,
        "InvalidRequest",
        "This email address is not supported",
      ),
      new XrpcError("m", 500, undefined, undefined),
      new Error("Handle already taken"),
    ];
    for (const err of others) assert.ok(!isHandleRefusal(err), err.message);
  });
});

describe("isPermanentGroupAccountError", () => {
  it("gives up on invalid records, credentials and requests only", () => {
    assert.ok(isPermanentGroupAccountError(new RecordValidationError("c", [])));
    assert.ok(isPermanentGroupAccountError(new CredentialDecryptError("x")));
    assert.ok(isPermanentGroupAccountError(new XrpcResponseError("x")));
    assert.ok(
      isPermanentGroupAccountError(
        new XrpcError("m", 400, "InvalidRequest", "x"),
      ),
    );
    assert.ok(
      isPermanentGroupAccountError(
        new GroupAccountError("x", { permanent: true }),
      ),
    );
    assert.ok(
      !isPermanentGroupAccountError(
        new GroupAccountError("x", { permanent: false }),
      ),
    );
    assert.ok(
      !isPermanentGroupAccountError(
        new XrpcError("m", 503, undefined, undefined),
      ),
    );
    assert.ok(!isPermanentGroupAccountError(new XrpcNetworkError("m")));
    assert.ok(
      !isPermanentGroupAccountError(new Error("connection terminated")),
    );
  });
});
