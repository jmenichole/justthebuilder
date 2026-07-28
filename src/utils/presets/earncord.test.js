import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateBlueprint } from "../ai/schemas.js";
import {
  isEarnCordPreset,
  loadEarnCordBlueprint,
  EARNCORD_TICKET_CATEGORIES
} from "./earncord.js";

describe("earncord preset", () => {
  it("recognizes earncord preset id", () => {
    assert.equal(isEarnCordPreset("earncord"), true);
    assert.equal(isEarnCordPreset("gaming"), false);
  });

  it("loads a schema-valid blueprint with EarnCord channels and tier roles", () => {
    const blueprint = loadEarnCordBlueprint({ name: "EarnCord" });
    const { valid, errors } = validateBlueprint(blueprint);
    assert.equal(valid, true, JSON.stringify(errors));

    const names = Object.values(blueprint.categories).flat().map((c) => c.name);
    assert.ok(names.includes("start-here"));
    assert.ok(names.includes("surveys"));
    assert.ok(names.includes("bot-commands"));

    const roleNames = blueprint.roles.map((r) => r.name);
    assert.ok(roleNames.includes("⚡ New Member"));
    assert.ok(roleNames.includes("🏆 Gold Surveyor"));

    assert.equal(blueprint.tickets.enabled, true);
    assert.equal(blueprint.tickets.categories.length, EARNCORD_TICKET_CATEGORIES.length);

    const start = Object.values(blueprint.categories)
      .flat()
      .find((c) => c.name === "start-here");
    assert.match(start.message.body + JSON.stringify(start.message.sections), /#login|\/start/);
  });
});
