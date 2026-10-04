import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { groupAccountsConfigProblem, readGroupAccountsConfig } from "./config";

const key = randomBytes(32).toString("base64");
const full = {
  GROUP_PDS_URL: "https://pds.lndry.social/",
  GROUP_HANDLE_DOMAIN: ".Lndry.Social",
  GROUP_PDS_ADMIN_PASSWORD: "admin-secret-value",
  GROUP_CREDENTIAL_KEY_1: key,
  GROUP_EMAIL_DOMAIN: "lndry.social",
};

describe("readGroupAccountsConfig", () => {
  it("is off without any variable, and says nothing is invalid", () => {
    const result = readGroupAccountsConfig({});
    assert.equal(result.config, null);
    assert.deepEqual(result.invalid, []);
    assert.deepEqual(result.missing.sort(), [
      "GROUP_CREDENTIAL_KEY_1",
      "GROUP_EMAIL_DOMAIN",
      "GROUP_HANDLE_DOMAIN",
      "GROUP_PDS_ADMIN_PASSWORD",
      "GROUP_PDS_URL",
    ]);
  });

  it("is on when every required variable is set, normalised", () => {
    const { config } = readGroupAccountsConfig(full);
    assert.ok(config);
    assert.equal(config.pdsUrl, "https://pds.lndry.social");
    assert.equal(config.handleDomain, "lndry.social");
    assert.equal(config.emailDomain, "lndry.social");
    assert.equal(config.credentialKeys[1]?.length, 32);
    assert.equal(config.credentialKeys[2], undefined);
    assert.equal(config.rateLimitBypassKey, undefined);
    assert.equal(config.plcUrl, "https://plc.directory");
  });

  it("stays off while anything is missing, naming only the variables", () => {
    for (const name of Object.keys(full)) {
      const partial: Record<string, string | undefined> = {
        ...full,
        [name]: "",
      };
      const result = readGroupAccountsConfig(partial);
      assert.equal(result.config, null, name);
      assert.deepEqual(result.missing, [name]);
      assert.ok(!JSON.stringify(result).includes("admin-secret-value"));
    }
  });

  it("takes the rotation slot alone, once the old key is gone", () => {
    const { config } = readGroupAccountsConfig({
      ...full,
      GROUP_CREDENTIAL_KEY_1: undefined,
      GROUP_CREDENTIAL_KEY_2: key,
    });
    assert.ok(config?.credentialKeys[2]);
  });

  it("refuses malformed values, without echoing them", () => {
    const cases: [string, string][] = [
      ["GROUP_CREDENTIAL_KEY_1", randomBytes(16).toString("base64")],
      ["GROUP_CREDENTIAL_KEY_1", "not base64 at all!!"],
      ["GROUP_PDS_URL", "http://pds.lndry.social"],
      ["GROUP_PDS_URL", "pds.lndry.social"],
      ["GROUP_HANDLE_DOMAIN", "social"],
      ["GROUP_EMAIL_DOMAIN", "lndry social"],
      // a mailbox somewhere else could reset every group's password
      ["GROUP_EMAIL_DOMAIN", "gmail.com"],
      ["GROUP_EMAIL_DOMAIN", "notlndry.social"],
      ["GROUP_PDS_RATE_LIMIT_BYPASS_KEY", "has a space"],
      ["GROUP_PDS_RATE_LIMIT_BYPASS_KEY", "line\nbreak"],
      ["GROUP_PLC_URL", "http://plc.directory"],
    ];
    for (const [name, value] of cases) {
      const result = readGroupAccountsConfig({ ...full, [name]: value });
      assert.equal(result.config, null, `${name}=${value}`);
      assert.deepEqual(result.invalid, [name]);
      assert.ok(!JSON.stringify(result).includes(value));
    }
  });

  it("allows plain http for a local dev-env only", () => {
    for (const url of ["http://localhost:2583", "http://127.0.0.1:2583"]) {
      assert.ok(
        readGroupAccountsConfig({ ...full, GROUP_PDS_URL: url }).config,
      );
    }
  });

  it("takes a mail domain under the handle domain", () => {
    assert.ok(
      readGroupAccountsConfig({
        ...full,
        GROUP_EMAIL_DOMAIN: "mail.lndry.social",
      }).config,
    );
  });
});

describe("groupAccountsConfigProblem", () => {
  it("is null when nothing is set or everything is", () => {
    assert.equal(groupAccountsConfigProblem({}), null);
    assert.equal(groupAccountsConfigProblem(full), null);
  });

  it("names what is missing or invalid once anything is set, never values", () => {
    assert.equal(
      groupAccountsConfigProblem({ GROUP_PDS_URL: "https://pds.lndry.social" }),
      "missing GROUP_HANDLE_DOMAIN, GROUP_PDS_ADMIN_PASSWORD, GROUP_EMAIL_DOMAIN, GROUP_CREDENTIAL_KEY_1",
    );
    const bad = { ...full, GROUP_CREDENTIAL_KEY_2: "not-a-key-value" };
    const problem = groupAccountsConfigProblem(bad);
    assert.equal(problem, "invalid GROUP_CREDENTIAL_KEY_2");
    assert.ok(!problem.includes("not-a-key-value"));
  });
});
