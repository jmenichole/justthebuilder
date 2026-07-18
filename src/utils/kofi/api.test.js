import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  allowedShopCodes,
  getKofiApiKey,
  isJustTheHelperShopOrder,
  kofiApiRequest,
  listShopItems,
  syncShopCatalog
} from "./api.js";

const catalogPath = path.resolve("data", "kofi", "shop-catalog.json");
const envBackup = {};

beforeEach(() => {
  envBackup.KOFI_API_KEY = process.env.KOFI_API_KEY;
  envBackup.KOFI_SHOP_ITEM_CODE = process.env.KOFI_SHOP_ITEM_CODE;
  envBackup.KOFI_HELPER_SHOP_ITEM_CODE = process.env.KOFI_HELPER_SHOP_ITEM_CODE;
  process.env.KOFI_API_KEY = "KF_API_test_key";
});

afterEach(() => {
  if (envBackup.KOFI_API_KEY === undefined) delete process.env.KOFI_API_KEY;
  else process.env.KOFI_API_KEY = envBackup.KOFI_API_KEY;
  if (envBackup.KOFI_SHOP_ITEM_CODE === undefined) delete process.env.KOFI_SHOP_ITEM_CODE;
  else process.env.KOFI_SHOP_ITEM_CODE = envBackup.KOFI_SHOP_ITEM_CODE;
  if (envBackup.KOFI_HELPER_SHOP_ITEM_CODE === undefined) delete process.env.KOFI_HELPER_SHOP_ITEM_CODE;
  else process.env.KOFI_HELPER_SHOP_ITEM_CODE = envBackup.KOFI_HELPER_SHOP_ITEM_CODE;
  if (fs.existsSync(catalogPath)) fs.unlinkSync(catalogPath);
  delete globalThis.fetch;
});

describe("kofi api client", () => {
  it("reads API key from env aliases", () => {
    process.env.KOFI_API_KEY = "KF_API_abc";
    assert.equal(getKofiApiKey(), "KF_API_abc");
  });

  it("lists shop items via /shop-items", async () => {
    globalThis.fetch = async (url, opts) => {
      assert.match(String(url), /shop-items/);
      assert.equal(opts.headers.Authorization, "Bearer KF_API_test_key");
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            items: [{ name: "Basic Build Pack", price: 0.99, direct_link_code: "2c6f47f1fc" }]
          })
      };
    };
    const { items } = await listShopItems();
    assert.equal(items.length, 1);
    assert.equal(items[0].direct_link_code, "2c6f47f1fc");
  });

  it("syncs catalog to disk", async () => {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          items: [{ name: "Creator Pack", price: 2.99, direct_link_code: "creator-xyz" }]
        })
    });
    await syncShopCatalog();
    assert.ok(fs.existsSync(catalogPath));
    const codes = allowedShopCodes();
    assert.ok(codes.has("2c6f47f1fc"));
    assert.ok(codes.has("creator-xyz"));
  });

  it("throws when API key missing", async () => {
    delete process.env.KOFI_API_KEY;
    await assert.rejects(() => kofiApiRequest("GET", "/me"), /KOFI_API_KEY not set/);
  });

  it("detects JustTheHelper shop orders by direct_link_code", () => {
    process.env.KOFI_HELPER_SHOP_ITEM_CODE = "helper99";
    assert.equal(
      isJustTheHelperShopOrder({
        type: "Shop Order",
        shop_items: [{ direct_link_code: "helper99" }]
      }),
      true
    );
    assert.equal(
      isJustTheHelperShopOrder({
        type: "Shop Order",
        shop_items: [{ direct_link_code: "2c6f47f1fc" }]
      }),
      false
    );
  });
});
