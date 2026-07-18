import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cloneBlueprintWithChannelCap,
  countBlueprintChannels
} from "./blueprintChannelCap.js";

describe("blueprintChannelCap", () => {
  it("counts channels across categories", () => {
    const bp = {
      categories: {
        INFO: [{ name: "welcome" }, { name: "rules" }],
        CHAT: [{ name: "general" }]
      }
    };
    assert.equal(countBlueprintChannels(bp), 3);
  });

  it("does not mutate the original blueprint when capping", () => {
    const channels = Array.from({ length: 15 }, (_, i) => ({ name: `ch-${i}` }));
    const bp = { categories: { A: channels.slice(0, 10), B: channels.slice(10) } };
    const { blueprint, truncated, kept, total } = cloneBlueprintWithChannelCap(bp, 12);
    assert.equal(total, 15);
    assert.equal(truncated, true);
    assert.equal(kept, 12);
    assert.equal(countBlueprintChannels(bp), 15);
    assert.equal(countBlueprintChannels(blueprint), 12);
    assert.equal(bp.categories.B.length, 5);
  });

  it("leaves small blueprints untouched", () => {
    const bp = { categories: { A: [{ name: "a" }, { name: "b" }] } };
    const { truncated, kept } = cloneBlueprintWithChannelCap(bp, 12);
    assert.equal(truncated, false);
    assert.equal(kept, 2);
  });
});
