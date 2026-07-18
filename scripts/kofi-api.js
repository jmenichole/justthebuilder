#!/usr/bin/env node
/**
 * Ko-fi API CLI — use with KOFI_API_KEY in env (.env, Fly secrets, or GitHub org secrets).
 *
 * Examples:
 *   node scripts/kofi-api.js whoami
 *   node scripts/kofi-api.js shop list
 *   node scripts/kofi-api.js shop create --name "Creator Pack" --price 2.99 --description "3 unlock credits"
 *   node scripts/kofi-api.js transactions --limit 10
 *   node scripts/kofi-api.js catalog sync
 */
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: "src/config/.env" });

import {
  createHelperShopItem,
  createShopItem,
  getCurrentUser,
  getKofiApiKey,
  listShopItems,
  listTransactions,
  loadShopCatalog,
  syncShopCatalog,
  HELPER_SHOP_DEFAULTS
} from "../src/utils/kofi/api.js";

function usage() {
  console.log(`Ko-fi API CLI (key: KOFI_API_KEY / KOFI_ACCESS_TOKEN)

Usage:
  node scripts/kofi-api.js whoami
  node scripts/kofi-api.js shop list [--page N] [--limit N]
  node scripts/kofi-api.js shop create --name "..." --price 0.99 [--description "..."]
  node scripts/kofi-api.js shop create-helper [--name "..."] [--price 1.99]
  node scripts/kofi-api.js transactions [--page N] [--limit N]
  node scripts/kofi-api.js catalog sync
  node scripts/kofi-api.js catalog show

Set KOFI_API_KEY from ko-fi.com (Settings → API). Never commit the key.
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, sub, ...rest] = args._;

  if (!cmd || cmd === "help" || cmd === "-h") {
    usage();
    process.exit(0);
  }

  if (!getKofiApiKey()) {
    console.error("❌ KOFI_API_KEY is not set. Add to .env, Fly secrets, or Cursor environment secrets.");
    process.exit(1);
  }

  try {
    if (cmd === "whoami") {
      const me = await getCurrentUser();
      console.log(JSON.stringify(me, null, 2));
      return;
    }

    if (cmd === "shop" && sub === "list") {
      const page = Number(args.page || 1);
      const limit = Number(args.limit || 50);
      const { items } = await listShopItems({ page, limit });
      if (!items.length) {
        console.log("No shop items returned.");
        return;
      }
      for (const item of items) {
        const code = item.direct_link_code || item.directLinkCode || item.code || "?";
        const name = item.name || item.title || "Unnamed";
        const price = item.price ?? item.unit_price ?? "?";
        console.log(`- ${name} | $${price} | code: ${code}`);
      }
      return;
    }

    if (cmd === "shop" && sub === "create-helper") {
      const name = args.name || HELPER_SHOP_DEFAULTS.name;
      const price = args.price != null ? args.price : HELPER_SHOP_DEFAULTS.price;
      const description = args.description || HELPER_SHOP_DEFAULTS.description;
      const { created, shopUrl, directLinkCode } = await createHelperShopItem({
        name,
        price: Number(price),
        description
      });
      console.log("✅ JustTheHelper shop item created (or API accepted request):");
      console.log(JSON.stringify(created, null, 2));
      if (directLinkCode) {
        console.log(`\nShop URL: ${shopUrl}`);
        console.log("\nNext — set Fly secrets:");
        console.log(`  flyctl secrets set KOFI_HELPER_SHOP_ITEM_CODE=${directLinkCode} -a justthebuilder`);
        console.log(`  flyctl secrets set KOFI_PAGE_URL=${shopUrl} -a justthehelper`);
      }
      console.log("\nTip: run `catalog sync`, then paste buyer message in Ko-fi shop dashboard:");
      console.log(
        "  Paste your server code from /subscribe info (JTH-XXXXXX) in the checkout message field."
      );
      return;
    }

    if (cmd === "shop" && sub === "create") {
      const name = args.name;
      const price = args.price;
      const description = args.description || "";
      if (!name || price == null) {
        console.error("Usage: shop create --name \"...\" --price 0.99 [--description \"...\"]");
        process.exit(1);
      }
      const created = await createShopItem({ name, price, description });
      console.log("✅ Shop item created (or API accepted request):");
      console.log(JSON.stringify(created, null, 2));
      console.log("\nTip: run `catalog sync` then set KOFI_SHOP_ITEM_CODE / KOFI_CREATOR_SHOP_ITEM_CODE on Fly.");
      return;
    }

    if (cmd === "transactions") {
      const page = Number(args.page || 1);
      const limit = Number(args.limit || 25);
      const data = await listTransactions({ page, limit });
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (cmd === "catalog" && sub === "sync") {
      const items = await syncShopCatalog();
      console.log(`✅ Synced ${items.length} item(s) to data/kofi/shop-catalog.json`);
      for (const item of items) {
        const code = item.direct_link_code || item.directLinkCode || "?";
        console.log(`  - ${item.name || item.title}: ${code}`);
      }
      return;
    }

    if (cmd === "catalog" && sub === "show") {
      const items = loadShopCatalog();
      console.log(JSON.stringify(items, null, 2));
      return;
    }

    if (rest.length) {
      console.error(`Unknown command: ${[cmd, sub, ...rest].join(" ")}`);
    }
    usage();
    process.exit(1);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    if (err.body) console.error(JSON.stringify(err.body, null, 2));
    process.exit(1);
  }
}

main();
