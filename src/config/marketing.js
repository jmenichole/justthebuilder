/** Shared product copy — keep in sync across site, bot DMs, and paywalls. */

export const TAGLINE = "Free: AI designs your server. $0.99: we build it.";

export const KOFI_BASIC_SHOP_URL = "https://ko-fi.com/s/2c6f47f1fc";

/** Set when you list Creator Pack as a separate Ko-fi shop item. */
export const KOFI_CREATOR_SHOP_URL =
  process.env.KOFI_CREATOR_SHOP_URL || "https://ko-fi.com/s/2c6f47f1fc";

export const FREE_CHANNEL_LIMIT = 12;

export const STRUCTURE_UPSELL = [
  "🎉 Your **layout** is live — categories and channel names are in place.",
  "",
  "Notice **#rules** and **#welcome** are still empty?",
  "",
  "✨ **Unlock for $0.99** posts your AI-written embeds, roles, permissions, pins & tickets.",
  "Your interview is saved — run **`/setup unlock`** (or redeem on [Ko-fi](" + KOFI_BASIC_SHOP_URL + ") first).",
  "",
  "_Free: AI designs your server. $0.99: we build it._"
].join("\n");
