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

/** Discord OAuth invite for the companion bot (set JUSTTHEHELPER_CLIENT_ID or JUSTTHEHELPER_INVITE_URL). */
/** Default JustTheHelper application ID (override with JUSTTHEHELPER_CLIENT_ID). */
export const DEFAULT_JUSTTHEHELPER_CLIENT_ID = "1525974622875422831";

export function getJustTheHelperInviteUrl() {
  const direct = process.env.JUSTTHEHELPER_INVITE_URL?.trim();
  if (direct) return direct;
  const clientId =
    process.env.JUSTTHEHELPER_CLIENT_ID?.trim() || DEFAULT_JUSTTHEHELPER_CLIENT_ID;
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands`;
}

/**
 * Soft upsell for JustTheHelper after a build completes.
 * @param {{ variant?: 'structure' | 'polish' | 'full' }} [opts]
 * @returns {string} Markdown block, or "" when disabled
 */
export function justTheHelperUpsell({ variant = "polish" } = {}) {
  if (/^(0|false|off|no)$/i.test(String(process.env.JUSTTHEHELPER_UPSELL || ""))) return "";

  const invite = getJustTheHelperInviteUrl();
  const name = invite ? `[JustTheHelper](${invite})` : "**JustTheHelper**";

  if (variant === "structure") {
    return [
      "",
      "───",
      "🎫 **Growing your community?**",
      `${name} — free **welcome + verify** and **/remind**; **$1.99/mo** unlocks private-thread **support tickets** (claim, close, staff flow).`,
      "Add it to this server, then run `/welcome post` to get started."
    ].join("\n");
  }

  return [
    "",
    "───",
    "🎫 **Level up member support**",
    `${name} pairs well with your new server:`,
    "• **Free:** welcome + verify button, personal `/remind`",
    "• **$1.99/mo (guild):** private-thread ticket panel — open → claim → close",
    "",
    "_JustTheBuilder built the layout; JustTheHelper runs day-to-day support._"
  ].join("\n");
}
