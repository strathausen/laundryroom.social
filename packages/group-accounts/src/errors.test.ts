import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CredentialDecryptError } from "./cipher";
import {
  describeError,
  GroupAccountError,
  isCredentialError,
  redactInLogs,
  sanitizedError,
} from "./errors";
import { XrpcError, XrpcNetworkError } from "./xrpc";

/** what drizzle 0.45 throws: the query and its parameters in the message */
class FakeDrizzleQueryError extends Error {
  constructor(
    readonly query: string,
    readonly params: unknown[],
    cause: unknown,
  ) {
    super(`Failed query: ${query}\nparams: ${params.join(",")}`, { cause });
  }
}

const pgError = (code: string, message: string) =>
  Object.assign(new Error(message), {
    code,
    severity: "ERROR",
    detail: "Key (group_id)=(secret-detail) is not present",
  });

describe("describeError", () => {
  it("never passes on query parameters, only the database's own message", () => {
    const sealed = "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB";
    const err = new FakeDrizzleQueryError(
      'insert into "group_credential" values ($1, $2)',
      ["8c4e…", sealed],
      pgError("23503", 'violates foreign key constraint "group_credential_fk"'),
    );
    const line = describeError(err);
    assert.match(line, /database error 23503/);
    assert.ok(!line.includes(sealed));
    assert.ok(!line.includes("secret-detail"));
    assert.ok(!line.includes("insert into"));
    const safe = sanitizedError(err);
    assert.equal(safe.cause, undefined);
    assert.ok(
      !JSON.stringify({ ...safe, message: safe.message }).includes(sealed),
    );
  });

  it("names a network failure without the cause's message", () => {
    const cause = Object.assign(
      new TypeError('invalid header value "the-bypass-key"'),
      { code: "ERR_INVALID_CHAR" },
    );
    const line = describeError(
      new XrpcNetworkError("com.atproto.server.createSession", { cause }),
    );
    assert.match(line, /createSession failed/);
    assert.match(line, /TypeError ERR_INVALID_CHAR/);
    assert.ok(!line.includes("the-bypass-key"));
  });

  it("keeps our own messages, and blanks out secrets and tokens anywhere", () => {
    redactInLogs(["admin-password-value"]);
    assert.equal(
      describeError(
        new GroupAccountError("no stored credentials for did:plc:x", {
          permanent: true,
        }),
      ),
      "GroupAccountError: no stored credentials for did:plc:x",
    );
    const line = describeError(
      new Error(
        "boom admin-password-value Bearer eyJhbGciOi.eyJzdWIiOiJ4In0.sig",
      ),
    );
    assert.ok(!line.includes("admin-password-value"));
    assert.ok(!line.includes("eyJzdWIiOiJ4In0"));
    assert.match(
      describeError(
        new XrpcError("m", 400, "InvalidRequest", "Handle already taken"),
      ),
      /m answered 400 InvalidRequest: Handle already taken/,
    );
  });

  it("knows which failures a credential recovery fixes", () => {
    assert.ok(isCredentialError(new CredentialDecryptError("x")));
    assert.ok(
      isCredentialError(
        new GroupAccountError("x", { permanent: true, credential: true }),
      ),
    );
    assert.ok(
      !isCredentialError(new GroupAccountError("x", { permanent: true })),
    );
  });
});
