/**
 * LocalPdsGroupHost against a small in-process fake of the pds endpoints it
 * calls: the handle rules (readable, opaque, refusals, claims), creation
 * edge cases, signals and the admin calls, offline. The real pds is covered
 * by local-pds-group-host.contract.test.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOpaqueGroupSlug, randomBase32 } from "@laundryroom/atproto";

import { GroupAccountError, isCredentialError } from "./errors";
import {
  handleRefusal,
  LocalPdsGroupHost,
  WRITER_APP_PASSWORD_NAME,
} from "./local-pds-group-host";
import { MemoryGroupCredentialStore } from "./store";
import { XrpcError } from "./xrpc";

const DOMAIN = "lndry.test";
const PDS = "https://pds.lndry.test";
const ADMIN = "admin-secret";

interface FakeAccount {
  did: string;
  handle: string;
  email: string;
  password: string;
  appPasswords: Map<string, string>;
  active: boolean;
  takenDown: boolean;
}

/** The pds endpoints LocalPdsGroupHost uses, in memory. */
class FakePds {
  readonly accounts = new Map<string, FakeAccount>();
  /** labels the pds refuses (its reserved list) */
  readonly reserved = new Set(["event", "team"]);
  readonly calls: { method: string; body: Record<string, unknown> }[] = [];
  private readonly tokens = new Map<string, string>();

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = url.pathname.replace(/^\/xrpc\//, "");
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    this.calls.push({ method, body });
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    return this.handle(method, body, auth);
  };

  private byHandle(handle: string) {
    return [...this.accounts.values()].find((a) => a.handle === handle);
  }

  private session(account: FakeAccount) {
    const token = (kind: string) => {
      const value = `x.${Buffer.from(
        JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 3600,
          kind,
          n: randomBase32(8),
        }),
      ).toString("base64url")}.y`;
      this.tokens.set(value, account.did);
      return value;
    };
    return json(200, {
      did: account.did,
      handle: account.handle,
      accessJwt: token("access"),
      refreshJwt: token("refresh"),
    });
  }

  private handleError(handle: unknown, own?: FakeAccount) {
    if (typeof handle !== "string" || !handle.endsWith(`.${DOMAIN}`)) {
      return json(400, { error: "UnsupportedDomain" });
    }
    const slug = handle.slice(0, -DOMAIN.length - 1);
    if (this.reserved.has(slug)) {
      return json(400, {
        error: "HandleNotAvailable",
        message: "Reserved handle",
      });
    }
    const holder = this.byHandle(handle);
    if (holder && holder !== own) {
      return json(400, {
        error: "InvalidRequest",
        message: `Handle already taken: ${handle}`,
      });
    }
    return null;
  }

  private handle(method: string, body: Record<string, unknown>, auth: string) {
    const caller = this.accounts.get(
      this.tokens.get(auth.replace(/^Bearer /, "")) ?? "",
    );
    const admin =
      auth === `Basic ${Buffer.from(`admin:${ADMIN}`).toString("base64")}`;
    switch (method) {
      case "com.atproto.server.createInviteCode":
        return admin ? json(200, { code: "invite" }) : json(401, {});
      case "com.atproto.server.createAccount": {
        const refused = this.handleError(body.handle);
        if (refused) return refused;
        if ([...this.accounts.values()].some((a) => a.email === body.email)) {
          return json(400, {
            error: "InvalidRequest",
            message: "Email already taken",
          });
        }
        const account: FakeAccount = {
          did: `did:plc:${randomBase32(24)}`,
          handle: body.handle as string,
          email: body.email as string,
          password: body.password as string,
          appPasswords: new Map(),
          active: true,
          takenDown: false,
        };
        this.accounts.set(account.did, account);
        return this.session(account);
      }
      case "com.atproto.server.createSession": {
        const account =
          this.accounts.get(body.identifier as string) ??
          this.byHandle(body.identifier as string);
        const ok =
          account &&
          !account.takenDown &&
          (account.password === body.password ||
            [...account.appPasswords.values()].includes(
              body.password as string,
            ));
        return ok
          ? this.session(account)
          : json(401, {
              error: "AuthenticationRequired",
              message: "Invalid identifier or password",
            });
      }
      case "com.atproto.admin.updateAccountPassword": {
        const account = this.accounts.get(body.did as string);
        if (!admin || !account) return json(401, {});
        account.password = body.password as string;
        return json(200, {});
      }
      case "com.atproto.admin.updateSubjectStatus": {
        const subject = body.subject as { did: string };
        const account = this.accounts.get(subject.did);
        if (!admin || !account) return json(401, {});
        account.takenDown = true;
        return json(200, {});
      }
    }
    if (!caller) return json(401, { error: "AuthenticationRequired" });
    switch (method) {
      case "com.atproto.server.getSession":
        return json(200, { did: caller.did, handle: caller.handle });
      case "com.atproto.server.listAppPasswords":
        return json(200, {
          passwords: [...caller.appPasswords.keys()].map((name) => ({ name })),
        });
      case "com.atproto.server.revokeAppPassword":
        caller.appPasswords.delete(body.name as string);
        return json(200, {});
      case "com.atproto.server.createAppPassword": {
        const password = randomBase32(16);
        caller.appPasswords.set(body.name as string, password);
        return json(200, { name: body.name, password });
      }
      case "com.atproto.identity.updateHandle": {
        const refused = this.handleError(body.handle, caller);
        if (refused) return refused;
        caller.handle = body.handle as string;
        return json(200, {});
      }
      case "com.atproto.server.deactivateAccount":
        caller.active = false;
        return json(200, {});
      case "com.atproto.repo.getRecord":
        return json(400, { error: "RecordNotFound" });
    }
    return json(501, { error: "MethodNotImplemented" });
  }

  /** how often `method` was called */
  count(method: string): number {
    return this.calls.filter((call) => call.method === method).length;
  }
}

function json(status: number, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function setup() {
  const pds = new FakePds();
  const store = new MemoryGroupCredentialStore();
  const host = new LocalPdsGroupHost({
    pdsUrl: PDS,
    handleDomain: DOMAIN,
    emailDomain: DOMAIN,
    adminPassword: ADMIN,
    store,
    fetch: pds.fetch,
  });
  return { pds, store, host };
}

const readable = (name: string) => ({ kind: "readable", name }) as const;
const opaque = { kind: "opaque" } as const;
const slug = (handle: string) => handle.slice(0, -DOMAIN.length - 1);

describe("LocalPdsGroupHost (fake pds)", () => {
  it("creates a readable account, and a suffixed one for the same name", async () => {
    const { store, host } = setup();
    const first = await host.createGroupAccount({
      groupId: "g1",
      handle: readable("Foodie Space"),
    });
    assert.equal(first.handle, `foodie-space.${DOMAIN}`);
    assert.equal(store.claims.get("foodie-space"), "g1");
    assert.ok(store.rows.get("g1")?.appPassword);

    const second = await host.createGroupAccount({
      groupId: "g2",
      handle: readable("Foodie  Space!"),
    });
    // the claim of g1 is never asked for, the pds is not even asked
    assert.equal(second.handle, `foodie-space-2.${DOMAIN}`);
  });

  it("keeps the opaque handle of a public group without a readable name", async () => {
    const { pds, host } = setup();
    const name = "東京ミートアップ";
    const account = await host.createGroupAccount({
      groupId: "g1",
      handle: readable(name),
    });
    assert.ok(isOpaqueGroupSlug(slug(account.handle)));
    // two syncs later (each asks for a readable handle): still the same one
    for (let i = 0; i < 2; i++) {
      assert.equal(
        await host.updateHandle({
          groupDid: account.did,
          handle: readable(name),
        }),
        account.handle,
      );
    }
    assert.equal(pds.count("com.atproto.identity.updateHandle"), 0);
    // exactly one account, made with one handle
    assert.equal(pds.count("com.atproto.server.createAccount"), 1);
  });

  it("goes straight to opaque for a reserved name, without trying variants", async () => {
    const { pds, host } = setup();
    const account = await host.createGroupAccount({
      groupId: "g1",
      handle: readable("Event"),
    });
    assert.ok(isOpaqueGroupSlug(slug(account.handle)));
    const tried = pds.calls
      .filter((call) => call.method === "com.atproto.server.createAccount")
      .map((call) => call.body.handle);
    assert.deepEqual(tried.slice(0, 1), [`event.${DOMAIN}`]);
    assert.equal(tried.length, 2);

    // and a later sync asks once more, but mints no new opaque handle
    assert.equal(
      await host.updateHandle({
        groupDid: account.did,
        handle: readable("Event"),
      }),
      account.handle,
    );
    assert.equal(pds.count("com.atproto.identity.updateHandle"), 1);
  });

  it("never asks the pds for a name on the deny list", async () => {
    const { pds, host } = setup();
    const account = await host.createGroupAccount({
      groupId: "g1",
      handle: readable("Laundryroom Official Fans"),
    });
    assert.ok(isOpaqueGroupSlug(slug(account.handle)));
    assert.equal(pds.count("com.atproto.server.createAccount"), 1);
  });

  it("gives a group its own handle back after a private spell, and nobody else", async () => {
    const { store, host } = setup();
    const a = await host.createGroupAccount({
      groupId: "a",
      handle: readable("Foodiespace"),
    });
    assert.equal(a.handle, `foodiespace.${DOMAIN}`);
    // a renamed, then private: an opaque handle, the claim stays
    const hidden = await host.updateHandle({ groupDid: a.did, handle: opaque });
    assert.ok(isOpaqueGroupSlug(slug(hidden)));
    assert.equal(store.claims.get("foodiespace"), "a");

    // another group of that name does not get the freed handle
    const b = await host.createGroupAccount({
      groupId: "b",
      handle: readable("FoodieSpace"),
    });
    assert.equal(b.handle, `foodiespace-2.${DOMAIN}`);

    // back to active, under a new name: its old handle again
    const back = await host.updateHandle({
      groupDid: a.did,
      handle: readable("Foodie Space Berlin"),
    });
    assert.equal(back, `foodiespace.${DOMAIN}`);
  });

  it("takes an account down again when its group vanished during creation", async () => {
    const { pds, store, host } = setup();
    store.saveDid = () => Promise.resolve(false);
    await assert.rejects(
      host.createGroupAccount({
        groupId: "g1",
        handle: readable("Gone Group"),
      }),
      (err) => err instanceof GroupAccountError && err.permanent,
    );
    const [account] = [...pds.accounts.values()];
    assert.equal(account?.active, false);
  });

  it("stops at once when its job signal aborts", async () => {
    const { pds, host } = setup();
    const controller = new AbortController();
    controller.abort(
      new GroupAccountError("lost the lock", { permanent: false }),
    );
    await assert.rejects(
      host.withSignal(controller.signal).createGroupAccount({
        groupId: "g1",
        handle: readable("Foodie Space"),
      }),
      /lost the lock/,
    );
    assert.equal(pds.calls.length, 0);
  });

  it("recovers a lost credential with the pds admin", async () => {
    const { pds, store, host } = setup();
    const account = await host.createGroupAccount({
      groupId: "g1",
      handle: readable("Foodie Space"),
    });
    store.rows.delete("g1");
    const fresh = new LocalPdsGroupHost({
      pdsUrl: PDS,
      handleDomain: DOMAIN,
      emailDomain: DOMAIN,
      adminPassword: ADMIN,
      store,
      fetch: pds.fetch,
    });
    await assert.rejects(fresh.writer(account.did), (err) =>
      isCredentialError(err),
    );
    const recovered = await fresh.recoverAccount("g1", account.did);
    assert.equal(recovered.did, account.did);
    const row = store.rows.get("g1");
    assert.equal(row?.did, account.did);
    assert.equal(
      pds.accounts.get(account.did)?.appPasswords.get(WRITER_APP_PASSWORD_NAME),
      row.appPassword,
    );
    await fresh.writer(account.did);
  });

  it("takes an account down with the admin password", async () => {
    const { pds, host } = setup();
    const account = await host.createGroupAccount({
      groupId: "g1",
      handle: readable("Foodie Space"),
    });
    await host.takeDown(account.did, "laundryroom:test");
    assert.equal(pds.accounts.get(account.did)?.takenDown, true);
  });
});

describe("handleRefusal", () => {
  const error = (status: number, name?: string, message?: string) =>
    new XrpcError("com.atproto.server.createAccount", status, name, message);

  it("tells taken handles from reserved or refused ones", () => {
    assert.equal(
      handleRefusal(error(400, "InvalidRequest", "Handle already taken: x")),
      "taken",
    );
    assert.equal(
      handleRefusal(error(400, "InvalidRequest", "Email already taken")),
      "taken",
    );
    assert.equal(
      handleRefusal(error(400, "HandleNotAvailable", "Reserved handle")),
      "unavailable",
    );
    assert.equal(
      handleRefusal(error(400, "InvalidHandle", "Inappropriate language")),
      "unavailable",
    );
    assert.equal(handleRefusal(error(400, "UnsupportedDomain")), null);
    assert.equal(handleRefusal(error(500, "InternalServerError")), null);
    assert.equal(handleRefusal(new Error("nope")), null);
  });
});
