import { log } from "../logger.js";
import { createCodeForOrder } from "./store.js";

const SHOP_ORDER = "Shop Order";

/**
 * Extract a Discord snowflake user ID from buyer text (custom question / message).
 * @param {string} text
 * @returns {string|null}
 */
export function parseDiscordUserId(text) {
  if (!text) return null;
  const match = String(text).match(/\b(\d{17,20})\b/);
  return match ? match[1] : null;
}

/**
 * @param {object} payload Parsed Ko-fi JSON body
 * @returns {boolean}
 */
export function verifyKofiToken(payload) {
  const expected = process.env.KOFI_VERIFICATION_TOKEN?.trim();
  if (!expected) {
    log("[kofi] KOFI_VERIFICATION_TOKEN not set — rejecting webhook");
    return false;
  }
  return payload?.verification_token === expected;
}

/** Default Basic Build Pack shop link suffix (ko-fi.com/s/2c6f47f1fc). */
const DEFAULT_BASIC_SHOP_CODE = "2c6f47f1fc";

/**
 * Ko-fi sends one webhook for the whole account — only issue JTB codes for our shop items.
 * @param {object} payload
 * @returns {boolean}
 */
export function isJustTheBuilderShopOrder(payload) {
  const items = payload.shop_items || [];
  if (items.length === 0) return false;

  const allowed = new Set([DEFAULT_BASIC_SHOP_CODE]);
  const basic = process.env.KOFI_SHOP_ITEM_CODE?.trim();
  const creator = process.env.KOFI_CREATOR_SHOP_ITEM_CODE?.trim();
  if (basic) allowed.add(basic);
  if (creator) allowed.add(creator);

  return items.some((item) => {
    const code = String(item.direct_link_code || "");
    for (const allowedCode of allowed) {
      if (code === allowedCode || code.includes(allowedCode)) return true;
    }
    return false;
  });
}

export function polishCreditsForShopOrder(payload) {
  const creatorCode = process.env.KOFI_CREATOR_SHOP_ITEM_CODE?.trim();
  const items = payload.shop_items || [];
  if (creatorCode && items.some((i) => String(i.direct_link_code || "") === creatorCode)) {
    return 3;
  }
  const labels = items
    .map((i) => `${i.direct_link_code || ""} ${i.variation_name || ""} ${i.name || ""}`.toLowerCase())
    .join(" ");
  if (/creator|3-pack|3 pack|three pack/.test(labels)) return 3;
  const amount = parseFloat(String(payload.amount || "0"));
  if (amount >= 2.5) return 3;
  return 1;
}

/**
 * Handle a verified Ko-fi webhook payload.
 * @param {object} payload
 * @param {import('discord.js').Client} [client]
 * @returns {Promise<{ ok: boolean, code?: string, entry?: object, reason?: string }>}
 */
export async function handleKofiPayload(payload, client) {
  if (!verifyKofiToken(payload)) {
    return { ok: false, reason: "invalid_token" };
  }

  if (payload.type !== SHOP_ORDER) {
    return { ok: true, reason: "ignored_type" };
  }

  if (!isJustTheBuilderShopOrder(payload)) {
    const items = payload.shop_items || [];
    log(
      `[kofi] ignored shop order (not JustTheBuilder): ${items.map((i) => i.direct_link_code || i.name || "?").join(", ") || "no items"}`
    );
    return { ok: true, reason: "ignored_shop_item" };
  }

  const discordUserId =
    parseDiscordUserId(payload.message) ||
    parseDiscordUserId(payload.discord_user_id) ||
    parseDiscordUserId(payload.custom_fields?.discord_user_id);

  const polishCredits = polishCreditsForShopOrder(payload);

  const entry = createCodeForOrder({
    kofiTransactionId: payload.kofi_transaction_id,
    messageId: payload.message_id,
    email: payload.email,
    fromName: payload.from_name,
    amount: payload.amount,
    currency: payload.currency,
    discordUserId,
    polishCredits
  });

  if (client && discordUserId && entry.status === "pending") {
    try {
      const user = await client.users.fetch(discordUserId);
      const thanksUrl = publicThanksUrl(entry.code);
      const packLabel =
        polishCredits > 1
          ? `Creator Pack — **${polishCredits} unlock credits**`
          : "Basic Build Pack — **1 unlock credit**";
      await user.send(
        [
          "🎉 **Thanks for your Ko-fi purchase!**",
          "",
          packLabel,
          `Your redeem code: \`${entry.code}\``,
          "",
          "In a server **you own**:",
          "1. Run `/setup run` if you haven't finished the interview",
          `2. Run \`/setup redeem code:${entry.code}\``,
          "3. Run `/setup unlock` to apply full polish",
          "",
          `More help: ${thanksUrl}`
        ].join("\n")
      );
      log(`[kofi] DM sent redeem code to ${discordUserId}`);
    } catch (err) {
      log(`[kofi] DM failed for ${discordUserId}: ${err.message}`);
    }
  }

  return { ok: true, code: entry.code, entry };
}

/**
 * @param {string} [code]
 */
export function publicThanksUrl(code) {
  const base = (process.env.PUBLIC_BASE_URL || "https://justthebuilder.fly.dev").replace(/\/$/, "");
  return code ? `${base}/kofi/thanks?code=${encodeURIComponent(code)}` : `${base}/kofi/thanks`;
}

/**
 * Parse Ko-fi application/x-www-form-urlencoded body.
 * @param {string} body
 */
export function parseKofiFormBody(body) {
  const params = new URLSearchParams(body);
  const raw = params.get("data");
  if (!raw) throw new Error("missing data field");
  return JSON.parse(raw);
}
