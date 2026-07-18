import { grantManualPolishGrant } from "../grandfather.js";
import { findCodeEntry, markCodeRedeemed } from "./store.js";
import { postAnalytics } from "../ops.js";

/**
 * Redeem a Ko-fi unlock code for the current guild (owner only).
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
    if (entry.redeemedGuildId === interaction.guild.id) {
      return {
        ok: true,
        message:
          "✅ This code was already redeemed on **this server**. Run `/setup unlock` to apply polish (after `/setup run` if needed)."
      };
    }
    return {
      ok: false,
      message: "❌ This code was already used on another server. Each purchase unlocks **one** server."
    };
  }

  grantManualPolishGrant(interaction.guild.id);
  markCodeRedeemed(entry.code, {
    userId: interaction.user.id,
    guildId: interaction.guild.id
  });

  postAnalytics({
    event: "kofi_redeemed",
    title: "☕ Ko-fi code redeemed",
    description: `**${interaction.guild.name}**`,
    fields: [
      { name: "Guild", value: `\`${interaction.guild.id}\``, inline: true },
      { name: "User", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Code", value: `\`${entry.code}\``, inline: true }
    ]
  });

  return {
    ok: true,
    message: [
      "✅ **Ko-fi unlock redeemed for this server!**",
      "",
      "Next steps:",
      "1. Run `/setup run` if you haven't finished the interview yet",
      "2. Run `/setup unlock` to apply roles, embeds, pins & tickets",
      "",
      "_This code is now tied to this server only._"
    ].join("\n")
  };
}
