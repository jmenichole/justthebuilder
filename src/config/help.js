import { TAGLINE, KOFI_BASIC_SHOP_URL, getJustTheHelperInviteUrl } from "./marketing.js";

const FOOTER = "_JustTheBuilder builds your server · JustTheHelper runs day-to-day support_";

/**
 * Scenario-based command guide (slash + /help).
 */
export function buildHelpMessage() {
  const helperInvite = getJustTheHelperInviteUrl();
  const helperLine = helperInvite
    ? `[JustTheHelper](${helperInvite}) — welcome, reminders & tickets`
    : "JustTheHelper — welcome, reminders & tickets";

  return [
    "**JustTheBuilder — command guide**",
    `_${TAGLINE}_`,
    "",
    "🚀 **New server** → `/setup run`",
    "💎 **Bought on Ko-fi** → `/setup redeem` then `/setup unlock`",
    "🎁 **Got a free grant** → `/setup unlock` _(after interview, if you have one)_",
    "📝 **Fix empty embeds** → `/setup post-messages` _(after unlock)_",
    "🎫 **Ticket menu** → `/setup ticket-panel` _(after unlock)_",
    "♻️ **Rebuild after nuke** → `/setup restore` _(attach the backup JSON)_",
    "☢️ **Start over** → `/setup nuke` then `/setup restore` or `/setup run`",
    "",
    `🎫 **Day-to-day support** → ${helperLine}`,
    "",
    "❓ **Full command list** → `/help`",
    "",
    FOOTER
  ].join("\n");
}

/**
 * Owner DM after `/grant free-build`.
 * @param {{ guildName: string, hasBlueprint?: boolean, structureApplied?: boolean, polishApplied?: boolean }} opts
 */
export function buildGrantFreeBuildOwnerDm({
  guildName,
  hasBlueprint = false,
  structureApplied = false,
  polishApplied = false
}) {
  const lines = [
    "🎁 **You've been granted a free full server build** on **JustTheBuilder**.",
    "",
    `Server: **${guildName}**`,
    ""
  ];

  if (polishApplied) {
    lines.push(
      "This server **already has the full unlock** applied.",
      "Need a refresh? Run `/setup post-messages` or `/setup ticket-panel`.",
      "",
      "Run `/help` in your server for all commands."
    );
    return lines.join("\n");
  }

  if (hasBlueprint) {
    lines.push(
      "Your AI interview is **saved** — no need to start over.",
      "",
      "**Next step (server owner, in that server):**",
      "1. Run **`/setup unlock`** — applies roles, embeds, pins & tickets",
      structureApplied
        ? "2. _(Optional)_ `/setup post-messages` if any embeds look empty"
        : "2. If you only applied free layout before, unlock still works — it completes the full build"
    );
  } else {
    lines.push(
      "**Next steps (server owner, in that server):**",
      "1. Run **`/setup run`** — quick AI interview in DMs",
      "2. Run **`/setup unlock`** — applies the full build (your grant covers this)"
    );
  }

  lines.push("", "Run **`/help`** anytime for the full command list.");
  return lines.join("\n");
}

/**
 * When unlock is denied (no pack / grant / credit).
 */
export function buildUnlockDeniedMessage() {
  return [
    "🔒 **Launch-ready setup needs an unlock ($0.99).**",
    `• [Basic — $0.99](${KOFI_BASIC_SHOP_URL}) → \`/setup redeem\` → \`/setup unlock\``,
    "• Or buy from the bot profile → `/setup unlock`",
    "• Got a comp from support? Run **`/setup unlock`** after we grant your server",
    "",
    "Run **`/help`** in your server for step-by-step commands.",
    "",
    `_${TAGLINE}_`,
    "Your interview is saved — no re-interview needed."
  ].join("\n");
}

/**
 * Discord SKU Basic Build Pack purchase DM.
 * @param {string} supportLink
 */
export function buildDiscordBasicPackPurchaseDm(supportLink) {
  return [
    "🎉 **Thanks for grabbing the Basic Build Pack!**",
    "",
    "1. Go to any Discord server **you own**",
    "2. Run **`/setup run`** — AI interview in DMs _(skip if already done)_",
    "3. Run **`/setup unlock`** — roles, embeds, pins & tickets",
    "",
    "One pack = **one full build** on that server.",
    "",
    "💡 **Already finished the interview?** Press **Unlock full setup** in your DMs — or run **`/setup unlock`** in your server if the button doesn't respond.",
    "",
    "Run **`/help`** in your server for more commands.",
    "",
    `Need help? ${supportLink}`
  ].join("\n");
}

/**
 * Ko-fi purchase DM (from webhook).
 * @param {{ code: string, thanksUrl: string, polishCredits?: number }} opts
 */
export function buildKofiPurchaseDm({ code, thanksUrl, polishCredits = 1 }) {
  const packLabel =
    polishCredits > 1
      ? `Creator Pack — **${polishCredits} unlock credits**`
      : "Basic Build Pack — **1 unlock credit**";

  return [
    "🎉 **Thanks for your Ko-fi purchase!**",
    "",
    packLabel,
    `Your redeem code: \`${code}\``,
    "",
    "In a server **you own**:",
    "1. Run **`/setup run`** if you haven't finished the interview",
    `2. Run **\`/setup redeem code:${code}\`**`,
    "3. Run **`/setup unlock`** to apply full polish",
    "",
    "Run **`/help`** in your server for the full guide.",
    "",
    `More help: ${thanksUrl}`
  ].join("\n");
}

/**
 * Short install DM add-on (appended to onboarding intro).
 */
export function buildInstallHelpHint() {
  return "Run **`/help`** in your server anytime for commands.";
}

/**
 * Owner DM when they win the install surprise lottery.
 * @param {{ guildName: string, hasBlueprint?: boolean }} opts
 */
export function buildSurpriseGrantOwnerDm({ guildName, hasBlueprint = false }) {
  const lines = [
    "🎉 **Surprise — you won a free full server unlock!**",
    "",
    "We're growing JustTheBuilder and picked your install for a **complimentary upgrade**. Help us test, share feedback if you can, and enjoy the full build on us.",
    "",
    `Server: **${guildName}**`,
    ""
  ];

  if (hasBlueprint) {
    lines.push(
      "Your interview is **saved** — run **`/setup unlock`** in that server to apply roles, embeds, pins & tickets."
    );
  } else {
    lines.push(
      "**Next steps (server owner, in that server):**",
      "1. Run **`/setup run`** — quick AI interview in DMs",
      "2. Run **`/setup unlock`** — your surprise covers the full build"
    );
  }

  lines.push("", "Run **`/help`** anytime. Thanks for trying us out! 💛");
  return lines.join("\n");
}
