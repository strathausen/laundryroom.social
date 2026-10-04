import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { JobInput, JobName } from "./registry";
import { jobNames, parsePayload } from "./registry";

/** Payloads each job is enqueued with; the type makes a missing job an error. */
const groupId = "5f0c2a8e-3b1d-4c7e-9a10-2b6f4d8e1c3a";

const samples: { [N in JobName]: JobInput<N>[] } = {
  heartbeat: [{ trigger: "schedule" }, { trigger: "startup" }],
  "group.ensureAccount": [{ groupId }],
  "group.syncProfile": [{ groupId }],
  "group.retireAccount": [{ groupId }],
  "group.reconcileAccounts": [{ trigger: "schedule" }, { trigger: "manual" }],
  "group.backfillAccounts": [
    {},
    { batchSize: 5, spacingSeconds: 120 },
    {
      after: { createdAt: "2024-03-01 12:00:00.123456", id: groupId },
      batchSize: 10,
      spacingSeconds: 60,
    },
  ],
};

describe("registry", () => {
  for (const name of jobNames) {
    it(`${name}: a stored payload parses to the same data in the worker`, () => {
      for (const sample of samples[name]) {
        // what enqueue stores, after pg-boss's jsonb round trip
        const sent = parsePayload(name, sample);
        const stored: unknown = JSON.parse(JSON.stringify(sent));
        assert.deepEqual(parsePayload(name, stored), sent);
      }
    });
  }
});

describe("group account jobs", () => {
  it("refuse a payload without a group id", () => {
    assert.throws(() => parsePayload("group.syncProfile", { groupId: "foo" }));
    assert.throws(() => parsePayload("group.ensureAccount", {}));
  });

  it("backfill with defaults spaced far below the relay limit", () => {
    const { batchSize, spacingSeconds } = parsePayload(
      "group.backfillAccounts",
      {},
    );
    assert.equal(batchSize, 10);
    // one account a minute, each at most ~5 firehose events: 300 an hour,
    // against 2,600 an hour per host
    assert.ok((3600 / spacingSeconds) * 5 <= 2600 / 4);
  });
});
