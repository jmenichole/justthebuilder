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

  const shopUrl = process.env.KOFI_SHOP_URL || "https://ko-fi.com/s/2c6f47f1fc";
  const items = payload.shop_items || [];
  const matchesShop =
    !process.env.KOFI_SHOP_ITEM_CODE ||
    items.some(
      (item) =>
        String(item.direct_link_code || "") === String(process.env.KOFI_SHOP_ITEM_CODE) ||
        String(item.direct_link_code || "").includes("2c6f47f1fc")
    );
  if (!matchesShop && items.length > 0) {
    log(`[kofi] shop order items: ${items.map((i) => i.direct_link_code).join(", ")}`);
  }

  const discordUserId =
    parseDiscordUserId(payload.message) ||
    parseDiscordUserId(payload.discord_user_id) ||
    parseDiscordUserId(payload.custom_fields?.discord_user_id);

  const entry = createCodeForOrder({
    kofiTransactionId: payload.kofi_transaction_id,
    messageId: payload.message_id,
    email: payload.email,
    fromName: payload.from_name,
    amount: payload.amount,
    currency: payload.currency,
    discordUserId
  });

  if (client && discordUserId && entry.status === "pending") {
    try {
      const user = await client.users.fetch(discordUserId);
      const thanksUrl = publicThanksUrl(entry.code);
      await user.send(
        [
          "🎉 **Thanks for your Ko-fi purchase!**",
          "",
          `Your unlock code: \`${entry.code}\``,
          "",
          "In a server **you own**:",
          `1. Run \`/setup run\` if you haven't finished the interview`,
          `2. Run \`/setup redeem code:${entry.code}\``,
          "3. Run \`/setup unlock\` to apply full polish",
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
