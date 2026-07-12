import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasReachedStructure, STRUCTURE_STEPS } from "./funnel.js";

describe("hasReachedStructure", () => {
  it("true when structureAppliedAt set", () => {
    assert.equal(hasReachedStructure({ structureAppliedAt: "2026-01-01" }), true);
  });
  it("true when lastStep is polish_applied", () => {
    assert.equal(hasReachedStructure({ funnel: { lastStep: "polish_applied" } }), true);
  });
  it("false when only install", () => {
    assert.equal(hasReachedStructure({ funnel: { lastStep: "guild_install" } }), false);
  });
  it("STRUCTURE_STEPS includes structure_applied", () => {
    assert.equal(STRUCTURE_STEPS.has("structure_applied"), true);
  });
});
