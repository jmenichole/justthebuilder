import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeChannelKey, nukeBackupToBlueprint } from "./nukeRestore.js";

describe("nukeRestore", () => {
  it("normalizes branded channel names", () => {
    assert.equal(normalizeChannelKey("💸│welcome"), "welcome");
    assert.equal(normalizeChannelKey("rules"), "rules");
  });

  it("converts array-shaped nuke backup to blueprint categories object", () => {
    const backup = {
      name: "Test",
      roles: [{ name: "Admin", permissions: ["Administrator"], color: "ff0000" }],
      categories: [
        {
          name: "INFO",
          channels: [
            { name: "welcome", type: "text", topic: "hi", overwrites: [], webhooks: [] },
            { name: "rules", type: "text", permissionsPreset: "public-readonly" }
          ]
        }
      ]
    };
    const result = nukeBackupToBlueprint(backup);
    assert.equal(result.ok, true);
    assert.ok(result.blueprint.categories.INFO);
    assert.equal(result.blueprint.categories.INFO.length, 2);
    assert.equal(result.blueprint.roles[0].color, "#ff0000");
    assert.equal(result.blueprint.categories.INFO[0].overwrites, undefined);
    assert.equal(result.stats.channelCount, 2);
  });

  it("merges embed messages from saved interview blueprint by channel name", () => {
    const backup = {
      categories: [
        {
          name: "INFO",
          channels: [
            { name: "💸│rules", type: "text" },
            { name: "about", type: "text" }
          ]
        }
      ]
    };
    const saved = {
      tickets: { enabled: true, panelChannel: "create-ticket", categories: [] },
      categories: {
        INFO: [
          {
            name: "rules",
            type: "text",
            pinMessage: true,
            message: { title: "Rules", body: "1. Be kind" }
          },
          {
            name: "about",
            type: "text",
            message: { title: "About", body: "We build stuff" }
          }
        ]
      }
    };
    const result = nukeBackupToBlueprint(backup, { savedBlueprint: saved });
    assert.equal(result.ok, true);
    const rules = result.blueprint.categories.INFO.find((c) => normalizeChannelKey(c.name) === "rules");
    assert.equal(rules.message.title, "Rules");
    assert.equal(rules.pinMessage, true);
    assert.equal(result.blueprint.tickets.enabled, true);
    assert.equal(result.stats.mergedMessages, 2);
  });

  it("accepts blueprint-shaped JSON (categories object)", () => {
    const backup = {
      roles: [{ name: "Member" }],
      categories: { CHAT: [{ name: "general", type: "text" }] }
    };
    const result = nukeBackupToBlueprint(backup);
    assert.equal(result.ok, true);
    assert.equal(result.blueprint.categories.CHAT[0].name, "general");
  });
});
