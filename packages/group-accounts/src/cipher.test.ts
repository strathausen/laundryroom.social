import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import {
  CredentialCipher,
  CredentialDecryptError,
  credentialKeyId,
  randomPassword,
} from "./cipher";

const key1 = randomBytes(32);
const key2 = randomBytes(32);
const context =
  "group_credential:7d0c6b0e-0000-4000-8000-000000000001:app_password";

describe("CredentialCipher", () => {
  it("round-trips, with a fresh iv every time", () => {
    const cipher = new CredentialCipher({ 1: key1 });
    const a = cipher.encrypt("hunter2", context);
    const b = cipher.encrypt("hunter2", context);
    assert.notEqual(a, b);
    assert.ok(!a.includes("hunter2"));
    assert.equal(cipher.decrypt(a, cipher.currentKeyId, context), "hunter2");
    assert.equal(cipher.decrypt(b, cipher.currentKeyId, context), "hunter2");
  });

  it("binds a value to its row and column", () => {
    const cipher = new CredentialCipher({ 1: key1 });
    const sealed = cipher.encrypt("hunter2", context);
    const other = context.replace("app_password", "master_password");
    assert.throws(
      () => cipher.decrypt(sealed, cipher.currentKeyId, other),
      CredentialDecryptError,
    );
  });

  it("refuses tampered and malformed values without echoing them", () => {
    const cipher = new CredentialCipher({ 1: key1 });
    const sealed = cipher.encrypt("hunter2", context);
    const [format, iv, body] = sealed.split(".") as [string, string, string];
    const flipped = `${format}.${iv}.${body.slice(0, -2)}${body.endsWith("A") ? "B" : "A"}${body.slice(-1)}`;
    for (const bad of [
      flipped,
      "v1.x.y",
      "v2.a.b",
      "nonsense",
      `${sealed}.x`,
    ]) {
      assert.throws(
        () => cipher.decrypt(bad, cipher.currentKeyId, context),
        (err: unknown) =>
          err instanceof CredentialDecryptError &&
          !err.message.includes("hunter2") &&
          !err.message.includes(bad),
      );
    }
  });

  it("names keys by fingerprint and finds the right one while rotating", () => {
    const before = new CredentialCipher({ 1: key1 });
    const sealed = before.encrypt("hunter2", context);
    assert.equal(before.currentKeyId, credentialKeyId(key1));

    // slot 2 holds the new key: new values use it, old ones still decrypt
    const during = new CredentialCipher({ 1: key1, 2: key2 });
    assert.equal(during.currentKeyId, credentialKeyId(key2));
    assert.equal(
      during.decrypt(sealed, before.currentKeyId, context),
      "hunter2",
    );

    // the new key moved to slot 1: values written during rotation still decrypt
    const resealed = during.encrypt("hunter2", context);
    const after = new CredentialCipher({ 1: key2 });
    assert.equal(
      after.decrypt(resealed, during.currentKeyId, context),
      "hunter2",
    );
    assert.throws(
      () => after.decrypt(sealed, before.currentKeyId, context),
      CredentialDecryptError,
    );
    assert.ok(!after.hasKey(before.currentKeyId));
  });

  it("does not leak the key in its id", () => {
    const id = credentialKeyId(key1);
    assert.match(id, /^k[0-9a-f]{16}$/);
    assert.ok(!id.includes(key1.toString("hex").slice(0, 16)));
    assert.equal(id, credentialKeyId(Buffer.from(key1)));
  });

  it("needs a 32-byte key", () => {
    assert.throws(() => new CredentialCipher({}));
    assert.throws(() => new CredentialCipher({ 1: randomBytes(16) }));
  });
});

describe("randomPassword", () => {
  it("is 32 random bytes, base64url", () => {
    const a = randomPassword();
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, randomPassword());
  });
});
