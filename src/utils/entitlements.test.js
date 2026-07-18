import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canApplyPolish } from "./entitlements.js";
import { GRANDFATHER_CUTOFF_MS } from "./grandfather.js";
import { saveGuildConfig } from "./storage/guildConfig.js";

const envBackup = {};
const trackedGuildIds = [];

function trackGuild(id) {
  trackedGuildIds.push(id);
}

beforeEach(() => {
  envBackup.BOT_OWNER_ID = process.env.BOT_OWNER_ID;
  envBackup.PREMIUM_SKU_ID = process.env.PREMIUM_SKU_ID;
});

afterEach(() => {
  if (envBackup.BOT_OWNER_ID === undefined) delete process.env.BOT_OWNER_ID;
  else process.env.BOT_OWNER_ID = envBackup.BOT_OWNER_ID;
  if (envBackup.PREMIUM_SKU_ID === undefined) delete process.env.PREMIUM_SKU_ID;
  else process.env.PREMIUM_SKU_ID = envBackup.PREMIUM_SKU_ID;
  for (const id of trackedGuildIds) {
    const file = path.join("data", "guilds", `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  trackedGuildIds.length = 0;
});

describe("canApplyPolish", () => {
  it("allows bot owner", async () => {
    process.env.BOT_OWNER_ID = "owner-123";
    const result = await canApplyPolish({ user: { id: "owner-123" }, entitlements: [] }, null);
    assert.deepEqual(result, { allowed: true, reason: "owner" });
  });

  it("allows unconsumed basic pack", async () => {
    process.env.PREMIUM_SKU_ID = "sku-basic";
    const result = await canApplyPolish(
      {
        user: { id: "user-1" },
        entitlements: [{ skuId: "sku-basic", consumed: false, id: "ent-1" }],
      },
      null
    );
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "pack");
    assert.equal(result.packEntitlement.skuId, "sku-basic");
  });

  it("denies when no entitlement path applies", async () => {
    delete process.env.BOT_OWNER_ID;
    delete process.env.PREMIUM_SKU_ID;
    const result = await canApplyPolish(
      { user: { id: "user-1" }, entitlements: [] },
      { id: "g1", joinedTimestamp: GRANDFATHER_CUTOFF_MS + 1 }
    );
    assert.deepEqual(result, { allowed: false, reason: "denied" });
  });

  it("allows manual polish grant regardless of join date", async () => {
    delete process.env.BOT_OWNER_ID;
    delete process.env.PREMIUM_SKU_ID;
    const guild = { id: "manual-grant-1", joinedTimestamp: GRANDFATHER_CUTOFF_MS + 1000 };
    trackGuild(guild.id);
    saveGuildConfig(guild.id, { manualPolishGrant: true });
    const result = await canApplyPolish({ user: { id: "user-1" }, entitlements: [] }, guild);
    assert.deepEqual(result, { allowed: true, reason: "manual_grant" });
  });
});
