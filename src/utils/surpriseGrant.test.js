import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateSurpriseGrant } from "./surpriseGrant.js";

describe("evaluateSurpriseGrant", () => {
  it("nth mode awards every Nth eligible install", () => {
    let state = { totalEligibleInstalls: 8, grantsAwarded: 0, installsSinceLastGrant: 8 };
    const miss = evaluateSurpriseGrant({
      state,
      everyN: 10,
      mode: "nth",
      randomFn: () => 0
    });
    assert.equal(miss.won, false);
    assert.equal(miss.state.totalEligibleInstalls, 9);

    const hit = evaluateSurpriseGrant({
      state: miss.state,
      everyN: 10,
      mode: "nth",
      randomFn: () => 0
    });
    assert.equal(hit.won, true);
    assert.equal(hit.state.grantsAwarded, 1);
  });

  it("random mode guarantees a win after N installs without one", () => {
    const result = evaluateSurpriseGrant({
      state: { totalEligibleInstalls: 11, grantsAwarded: 0, installsSinceLastGrant: 11 },
      everyN: 12,
      mode: "random",
      randomFn: () => 1
    });
    assert.equal(result.won, true);
  });

  it("random mode can win early when roll succeeds", () => {
    const result = evaluateSurpriseGrant({
      state: { totalEligibleInstalls: 0, grantsAwarded: 0, installsSinceLastGrant: 0 },
      everyN: 10,
      mode: "random",
      randomFn: () => 0
    });
    assert.equal(result.won, true);
  });
});
