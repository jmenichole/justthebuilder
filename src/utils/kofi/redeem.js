import { findCodeEntry, markCodeRedeemed } from "./store.js";
import { postAnalytics } from "../ops.js";
import { addPolishCredits, getPolishCredits } from "../userCredits.js";

/**
 * Redeem a Ko-fi unlock code — adds polish credits to the redeemer's account.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function redeemKofiCode(interaction) {
  const raw = interaction.options.getString("code", true).trim();
  const entry = findCodeEntry(raw);

  if (!entry || !entry.code) {
    return {
      ok: false,
      message:
        "❌ Code not found. Use the `JTB-XXXXXX` code from your Ko-fi DM or receipt, or paste your Ko-fi transaction ID from the email receipt."
    };
  }

  if (entry.status === "redeemed") {
    if (entry.redeemedByUserId === interaction.user.id) {
      const credits = getPolishCredits(interaction.user.id);
      return {
        ok: true,
        message:
          credits > 0
            ? `✅ You already redeemed this code. You have **${credits}** unlock credit(s) — run \`/setup unlock\` in a server you own.`
            : "❌ You already used this code and have no credits left from it."
      };
    }
    return {
      ok: false,
      message: "❌ This code was already redeemed by another account."
    };
  }

  const credits = entry.polishCredits || 1;
  const total = addPolishCredits(interaction.user.id, credits);
  markCodeRedeemed(entry.code, {
    userId: interaction.user.id,
    guildId: interaction.guild.id
  });

  postAnalytics({
    event: "kofi_redeemed",
    title: "☕ Ko-fi code redeemed",
    description: `**${interaction.guild.name}** — +${credits} credit(s)`,
    fields: [
      { name: "Guild", value: `\`${interaction.guild.id}\``, inline: true },
      { name: "User", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Credits", value: String(credits), inline: true }
    ]
  });

  return {
    ok: true,
    message: [
      `✅ **Redeemed — ${credits} unlock credit${credits === 1 ? "" : "s"} added!**`,
      `You now have **${total}** credit(s) total.`,
      "",
      "Next steps in **this server** (or any server you own):",
      "1. Run `/setup run` if you haven't finished the interview",
      "2. Run `/setup unlock` to apply roles, embeds, pins & tickets",
      "",
      "_Free: AI designs your server. $0.99: we build it._"
    ].join("\n")
  };
}
