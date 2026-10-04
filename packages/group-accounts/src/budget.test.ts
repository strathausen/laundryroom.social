import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NetworkBudget } from "./budget";

describe("NetworkBudget", () => {
  it("lets events through until the hour is full, then says how long to wait", () => {
    let now = 1_000_000;
    const budget = new NetworkBudget(10, () => now);
    assert.ok(budget.fits(10));
    budget.record(6);
    now += 10 * 60_000;
    budget.record(4);
    assert.ok(!budget.fits(1));
    // the first six leave the window 50 minutes from now
    assert.equal(budget.secondsUntilFits(1), 50 * 60);
    assert.equal(budget.secondsUntilFits(7), 60 * 60);
    now += 50 * 60_000;
    assert.ok(budget.fits(6));
    assert.ok(!budget.fits(7));
  });
});
