/**
 * LocalPdsGroupHost against a real pds: a local @atproto/dev-env shaped like
 * pds.lndry.social (invite-only, a handle domain of its own). Skipped unless
 * pointed at one (turbo passes these variables through, see turbo.json), so
 * `pnpm test` stays offline by default; run it with
 *
 *   GROUP_ACCOUNTS_CONTRACT_PDS_URL=http://localhost:2783 \
 *   GROUP_ACCOUNTS_CONTRACT_ADMIN_PASSWORD=admin-pass \
 *   GROUP_ACCOUNTS_CONTRACT_HANDLE_DOMAIN=lndry.test \
 *   [GROUP_ACCOUNTS_CONTRACT_BYPASS_KEY=…] [GROUP_ACCOUNTS_CONTRACT_PLC_URL=http://localhost:2782] \
 *   [GROUP_ACCOUNTS_CONTRACT_RECOVERY_DID_KEY=did:key:…] \
 *   pnpm -F @laundryroom/group-accounts test
 *
 * Never point it at pds.lndry.social: it creates and deactivates accounts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DidString } from "@atproto/lex";
import sharp from "sharp";

import type { GroupProfileFields } from "@laundryroom/atproto";
import { isOpaqueGroupSlug, NSID, randomBase32 } from "@laundryroom/atproto";

import {
  LocalPdsGroupHost,
  WRITER_APP_PASSWORD_NAME,
} from "./local-pds-group-host";
import { MemoryGroupCredentialStore } from "./store";

/* eslint-disable no-restricted-properties */
const PDS = process.env.GROUP_ACCOUNTS_CONTRACT_PDS_URL;
const ADMIN = process.env.GROUP_ACCOUNTS_CONTRACT_ADMIN_PASSWORD ?? "";
const DOMAIN = process.env.GROUP_ACCOUNTS_CONTRACT_HANDLE_DOMAIN ?? "";
const BYPASS = process.env.GROUP_ACCOUNTS_CONTRACT_BYPASS_KEY;
const PLC = process.env.GROUP_ACCOUNTS_CONTRACT_PLC_URL;
const RECOVERY = process.env.GROUP_ACCOUNTS_CONTRACT_RECOVERY_DID_KEY;
/* eslint-enable no-restricted-properties */

const skip =
  PDS && ADMIN && DOMAIN
    ? false
    : "set GROUP_ACCOUNTS_CONTRACT_PDS_URL, _ADMIN_PASSWORD and _HANDLE_DOMAIN (a local dev-env)";

/** names unique per run, so the same dev-env can be used again */
const tag = randomBase32(4);
const groupId = (n: number) =>
  `00000000-0000-4000-8000-${tag.replace(/[^0-9a-f]/g, "0").padEnd(4, "0")}0000000${n}`;

const sentHeaders: Headers[] = [];
const recordingFetch: typeof fetch = (input, init) => {
  sentHeaders.push(new Headers(init?.headers));
  return fetch(input, init);
};

function makeHost(
  store: MemoryGroupCredentialStore,
  fetchImpl = recordingFetch,
) {
  return new LocalPdsGroupHost({
    pdsUrl: PDS ?? "",
    handleDomain: DOMAIN,
    emailDomain: "test.com",
    adminPassword: ADMIN,
    rateLimitBypassKey: BYPASS,
    // checks every new did's document there (pds and handle)
    plcUrl: PLC,
    store,
    fetch: fetchImpl,
  });
}

const opaqueHandle = new RegExp(
  `^g-[a-z2-7]{6}\\.${DOMAIN.replace(".", "\\.")}$`,
);

async function get(path: string, params: Record<string, string>) {
  const url = new URL(path, PDS);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const res = await fetch(url);
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

const profile: GroupProfileFields = {
  displayName: "Foodie Space",
  description: "we cook together",
  locationName: "Berlin",
  timeZone: "Europe/Berlin",
  createdAt: "2024-03-01T12:00:00.000Z",
};

describe("LocalPdsGroupHost against a pds", { skip }, () => {
  const store = new MemoryGroupCredentialStore();
  const host = makeHost(store);
  const name = `Foodie ${tag}`;
  let did: DidString;

  it("creates a readable account with custodied credentials", async () => {
    const account = await host.createGroupAccount({
      groupId: groupId(1),
      handle: { kind: "readable", name },
    });
    did = account.did;
    assert.equal(account.handle, `foodie-${tag}.${DOMAIN}`);
    assert.match(did, /^did:plc:/);
    const stored = store.rows.get(groupId(1));
    assert.equal(stored?.did, did);
    assert.ok(stored.appPassword && stored.masterPassword);
    assert.notEqual(stored.appPassword, stored.masterPassword);

    const repo = await get("/xrpc/com.atproto.repo.describeRepo", {
      repo: did,
    });
    assert.equal(repo.body.handle, account.handle);
    // nothing in the public repo yet: the profile is written separately
    assert.deepEqual(repo.body.collections, []);
  });

  it(
    "puts the group-recovery key into the did's rotation keys",
    { skip: !PLC },
    async () => {
      const res = await fetch(new URL(`/${did}/data`, PLC));
      const data = (await res.json()) as { rotationKeys: string[] };
      assert.ok(data.rotationKeys.length >= 2);
      if (RECOVERY) assert.equal(data.rotationKeys[0], RECOVERY);
    },
  );

  it("is idempotent", async () => {
    const before = { ...store.rows.get(groupId(1)) };
    const again = await host.createGroupAccount({
      groupId: groupId(1),
      handle: { kind: "readable", name },
    });
    assert.equal(again.did, did);
    assert.deepEqual(store.rows.get(groupId(1)), before);
  });

  it("gives a second group of the same name a suffix", async () => {
    const second = await host.createGroupAccount({
      groupId: groupId(2),
      handle: { kind: "readable", name },
    });
    assert.equal(second.handle, `foodie-${tag}-2.${DOMAIN}`);
  });

  it("gives non-public groups an opaque handle", async () => {
    const hidden = await host.createGroupAccount({
      groupId: groupId(3),
      handle: { kind: "opaque" },
    });
    assert.match(hidden.handle, opaqueHandle);
  });

  it("gives a name the pds reserves an opaque handle, not a variant", async () => {
    // "event" is on the pds's reserved list, not on our deny list: the pds
    // is asked once and refuses it (HandleNotAvailable)
    const reserved = await host.createGroupAccount({
      groupId: groupId(4),
      handle: { kind: "readable", name: "Event" },
    });
    assert.match(reserved.handle, opaqueHandle);
  });

  it("keeps the opaque handle of a public group with a non-latin name", async () => {
    const intent = { kind: "readable", name: "東京ミートアップ" } as const;
    const account = await host.createGroupAccount({
      groupId: groupId(6),
      handle: intent,
    });
    assert.match(account.handle, opaqueHandle);
    // two syncs, each asking for a readable handle: no new handle
    for (let i = 0; i < 2; i++) {
      assert.equal(
        await host.updateHandle({ groupDid: account.did, handle: intent }),
        account.handle,
      );
    }
    if (PLC) {
      const res = await fetch(new URL(`/${account.did}/log/audit`, PLC));
      const ops = (await res.json()) as unknown[];
      // the genesis operation only
      assert.equal(ops.length, 1);
    }
  });

  it("gives a group its handle back after a private spell, and nobody else", async () => {
    const a = await host.createGroupAccount({
      groupId: groupId(7),
      handle: { kind: "readable", name: `Back ${tag}` },
    });
    assert.equal(a.handle, `back-${tag}.${DOMAIN}`);
    const hidden = await host.updateHandle({
      groupDid: a.did,
      handle: { kind: "opaque" },
    });
    assert.ok(isOpaqueGroupSlug(hidden.split(".")[0] ?? ""));
    // free on the pds now, but claimed by group 7
    const b = await host.createGroupAccount({
      groupId: groupId(8),
      handle: { kind: "readable", name: `BACK ${tag}` },
    });
    assert.equal(b.handle, `back-${tag}-2.${DOMAIN}`);
    assert.equal(
      await host.updateHandle({
        groupDid: a.did,
        handle: { kind: "readable", name: `Back ${tag} Berlin` },
      }),
      `back-${tag}.${DOMAIN}`,
    );
  });

  it("deactivates an account whose group was deleted while it was created", async () => {
    const vanishing = new MemoryGroupCredentialStore();
    let created: string | undefined;
    vanishing.saveDid = (_groupId: string, value: DidString) => {
      created = value;
      return Promise.resolve(false);
    };
    await assert.rejects(
      makeHost(vanishing).createGroupAccount({
        groupId: groupId(9),
        handle: { kind: "readable", name: `Gone ${tag}` },
      }),
      /deactivated again/,
    );
    assert.ok(created);
    const status = await get("/xrpc/com.atproto.sync.getRepoStatus", {
      did: created,
    });
    assert.equal(status.body.active, false);
  });

  it("finishes an interrupted creation instead of creating a second account", async () => {
    const flaky = new MemoryGroupCredentialStore();
    const failOnce = flaky.saveDid.bind(flaky);
    let failed = false;
    flaky.saveDid = (id: string, value: DidString) => {
      if (!failed) {
        failed = true;
        return Promise.reject(new Error("the worker died here"));
      }
      return failOnce(id, value);
    };
    const flakyHost = makeHost(flaky);
    const intent = { kind: "readable", name: `Crash ${tag}` } as const;
    await assert.rejects(
      flakyHost.createGroupAccount({ groupId: groupId(5), handle: intent }),
      /the worker died here/,
    );
    const reservation = flaky.rows.get(groupId(5));
    assert.equal(reservation?.did, null);
    assert.equal(reservation.handle, `crash-${tag}.${DOMAIN}`);

    // a fresh process (no cached sessions) picks the same account up
    const account = await makeHost(flaky).createGroupAccount({
      groupId: groupId(5),
      handle: intent,
    });
    // a second account would have had to take crash-<tag>-2
    assert.equal(account.handle, `crash-${tag}.${DOMAIN}`);
    assert.equal(flaky.rows.get(groupId(5))?.did, account.did);
    assert.ok(flaky.rows.get(groupId(5))?.appPassword);
  });

  let avatarCid: string | undefined;

  it("writes the public profile once, and again only when it changed", async () => {
    const first = await host.updateProfile({
      groupDid: did,
      profile,
      avatar: null,
    });
    assert.ok(first.changed);
    assert.equal(
      first.ref.uri,
      `at://${did}/${NSID.laundryroomGroupProfile}/self`,
    );
    const same = await host.updateProfile({
      groupDid: did,
      profile,
      avatar: null,
    });
    assert.equal(same.changed, false);
    assert.equal(same.ref.cid, first.ref.cid);

    const bytes = new Uint8Array(
      await sharp({
        create: { width: 64, height: 64, channels: 3, background: "#f0f" },
      })
        .webp()
        .toBuffer(),
    );
    const avatar = {
      bytes,
      mimeType: "image/webp" as const,
      alt: "a pink square",
    };
    const withAvatar = await host.updateProfile({
      groupDid: did,
      profile,
      avatar,
    });
    assert.ok(withAvatar.changed);
    const unchanged = await host.updateProfile({
      groupDid: did,
      profile,
      avatar,
    });
    assert.equal(unchanged.changed, false);
    // undefined keeps the stored avatar
    const kept = await host.updateProfile({ groupDid: did, profile });
    assert.equal(kept.changed, false);

    const record = await get("/xrpc/com.atproto.repo.getRecord", {
      repo: did,
      collection: NSID.laundryroomGroupProfile,
      rkey: "self",
    });
    const value = record.body.value as Record<string, unknown>;
    assert.equal(value.displayName, "Foodie Space");
    assert.equal(value.avatarAlt, "a pink square");
    avatarCid = (value.avatar as { ref: { $link: string } }).ref.$link;
    const blob = await fetch(
      new URL(
        `/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${avatarCid}`,
        PDS,
      ),
    );
    assert.equal(blob.status, 200);
  });

  it("takes the profile and its avatar off the network", async () => {
    assert.equal(await host.deleteProfile(did), true);
    const record = await get("/xrpc/com.atproto.repo.getRecord", {
      repo: did,
      collection: NSID.laundryroomGroupProfile,
      rkey: "self",
    });
    assert.equal(record.body.error, "RecordNotFound");
    assert.ok(avatarCid);
    const blob = await fetch(
      new URL(
        `/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${avatarCid}`,
        PDS,
      ),
    );
    assert.notEqual(blob.status, 200);
    assert.equal(await host.deleteProfile(did), false);
  });

  it("swaps the handle between readable and opaque, only when needed", async () => {
    const opaque = await host.updateHandle({
      groupDid: did,
      handle: { kind: "opaque" },
    });
    assert.match(opaque, /^g-[a-z2-7]{6}\./);
    assert.equal(store.rows.get(groupId(1))?.handle, opaque);
    assert.equal(
      await host.updateHandle({ groupDid: did, handle: { kind: "opaque" } }),
      opaque,
    );
    const readable = await host.updateHandle({
      groupDid: did,
      handle: { kind: "readable", name },
    });
    assert.equal(readable, `foodie-${tag}.${DOMAIN}`);
    // a renamed group keeps its readable handle
    assert.equal(
      await host.updateHandle({
        groupDid: did,
        handle: { kind: "readable", name: "Something Else" },
      }),
      readable,
    );
    const repo = await get("/xrpc/com.atproto.repo.describeRepo", {
      repo: did,
    });
    assert.equal(repo.body.handle, readable);
  });

  it("replaces a revoked app password with the master password", async () => {
    const full = await host.syncSession(did);
    const revoke = await full.fetchHandler(
      "/xrpc/com.atproto.server.revokeAppPassword",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: WRITER_APP_PASSWORD_NAME }),
      },
    );
    assert.equal(revoke.status, 200);
    const before = store.rows.get(groupId(1))?.appPassword;
    assert.ok(before);
    // a new process: no cached session, so it logs in with the revoked one
    const fresh = makeHost(store);
    await fresh.updateProfile({ groupDid: did, profile, avatar: null });
    const after = store.rows.get(groupId(1))?.appPassword;
    assert.ok(after);
    assert.notEqual(after, before);
  });

  it("sends the rate-limit bypass header exactly when configured", async () => {
    assert.ok(sentHeaders.length > 0);
    for (const headers of sentHeaders) {
      assert.equal(headers.get("x-ratelimit-bypass"), BYPASS ?? null);
    }
    const plain: Headers[] = [];
    const noBypass = new LocalPdsGroupHost({
      pdsUrl: PDS ?? "",
      handleDomain: DOMAIN,
      emailDomain: "test.com",
      adminPassword: ADMIN,
      store,
      fetch: (input, init) => {
        plain.push(new Headers(init?.headers));
        return fetch(input, init);
      },
    });
    await noBypass.deleteProfile(did);
    assert.ok(plain.length > 0);
    assert.ok(plain.every((headers) => !headers.has("x-ratelimit-bypass")));
  });

  it("deactivates, and deactivating again is fine", async () => {
    await host.deactivate(did);
    const status = await get("/xrpc/com.atproto.sync.getRepoStatus", { did });
    assert.equal(status.body.active, false);
    assert.equal(status.body.status, "deactivated");
    await host.deactivate(did);
  });
});
