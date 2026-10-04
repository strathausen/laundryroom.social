import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { JobInput, JobName } from "./registry";
import { jobNames, parsePayload } from "./registry";

/** Payloads each job is enqueued with; the type makes a missing job an error. */
const samples: { [N in JobName]: JobInput<N>[] } = {
  heartbeat: [{ trigger: "schedule" }, { trigger: "startup" }],
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
