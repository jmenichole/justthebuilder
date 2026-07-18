import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  createCodeForOrder,
  findCodeEntry,
  markCodeRedeemed,
  generateRedeemCode
} from "./store.js";
import { parseDiscordUserId, verifyKofiToken, isJustTheBuilderShopOrder } from "./webhook.js";

const codesFile = path.resolve("data", "kofi", "codes.json");

afterEach(() => {
  if (fs.existsSync(codesFile)) fs.unlinkSync(codesFile);
});

describe("kofi store", () => {
  it("generates JTB- prefixed codes", () => {
    const code = generateRedeemCode();
    assert.match(code, /^JTB-[A-Z0-9]{6}$/);
  });

  it("creates and redeems a code idempotently by transaction", () => {
    const a = createCodeForOrder({
      kofiTransactionId: "tx-100",
      messageId: "msg-1",
      email: "buyer@example.com"
    });
    const b = createCodeForOrder({
      kofiTransactionId: "tx-100",
      messageId: "msg-1"
    });
    assert.equal(a.code, b.code);

    const found = findCodeEntry(a.code);
    assert.equal(found.status, "pending");

    markCodeRedeemed(a.code, { userId: "u1", guildId: "g1" });
    const redeemed = findCodeEntry("tx-100");
    assert.equal(redeemed.status, "redeemed");
    assert.equal(redeemed.redeemedGuildId, "g1");
  });
});

describe("kofi webhook helpers", () => {
  it("parses discord user id from buyer message", () => {
    assert.equal(parseDiscordUserId("my id is 1153034319271559328 thanks"), "1153034319271559328");
    assert.equal(parseDiscordUserId("no id here"), null);
  });

  it("verifies kofi token when configured", () => {
    process.env.KOFI_VERIFICATION_TOKEN = "secret";
    assert.equal(verifyKofiToken({ verification_token: "secret" }), true);
    assert.equal(verifyKofiToken({ verification_token: "wrong" }), false);
    delete process.env.KOFI_VERIFICATION_TOKEN;
    assert.equal(verifyKofiToken({ verification_token: "secret" }), false);
  });

  it("accepts only JustTheBuilder shop items on a shared Ko-fi account", () => {
    assert.equal(
      isJustTheBuilderShopOrder({
        shop_items: [{ direct_link_code: "2c6f47f1fc", name: "Basic Build Pack" }]
      }),
      true
    );
    assert.equal(
      isJustTheBuilderShopOrder({
        shop_items: [{ direct_link_code: "other-bot-addon-xyz", name: "Other Bot Add-on" }]
      }),
      false
    );
    process.env.KOFI_SHOP_ITEM_CODE = "my-basic-code";
    assert.equal(
      isJustTheBuilderShopOrder({
        shop_items: [{ direct_link_code: "my-basic-code", name: "Basic" }]
      }),
      true
    );
    delete process.env.KOFI_SHOP_ITEM_CODE;
  });
});
