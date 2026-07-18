import { runInterview } from "../ai/interviewFlow.js";
import { log } from "../logger.js";
import { applyBlueprint, loadPersistedBlueprint, persistBlueprintOnly } from "../applyBlueprint.js";
import { prepareRestoreBlueprint } from "../nukeRestore.js";
import { postMessagesToExistingChannels } from "../builder/messages.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import { canApplyPolish, fetchUserEntitlements, findUnconsumedBasicPack, guildHasPolishApplied, isBotOwner } from "../entitlements.js";
import { clearManualPolishGrant, markGrandfatherFullUsed } from "../grandfather.js";
import { postAnalytics } from "../ops.js";
import { deferEphemeral, isInteractionTokenError, replyEphemeral } from "../interactionUi.js";
import { buildUnlockDeniedMessage } from "../../config/help.js";
import { KOFI_BASIC_SHOP_URL, TAGLINE } from "../../config/marketing.js";
import { consumePolishCredit } from "../userCredits.js";
import fs from 'fs';
import path from 'path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  PermissionFlagsBits
} from "discord.js";

// Optional userId -> guildId cache for freemium paywall DMs; guildId is also embedded
// in button customIds so clicks survive bot restarts.
const pendingPaywallGuild = new Map();

// In-memory cooldown stores
const serverCooldowns = new Map(); // guildId -> timestamp
const userCooldowns = new Map(); // userId -> timestamp

const SERVER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const USER_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Slash command definition for /setup with all subcommands.
 * @type {object}
 */
export const SetupCommandData = {
  name: "setup",
  description: "Build or manage your server with JustTheBuilder.",
  options: [
    { 
      type: 1, 
      name: "run", 
      description: "Run the automated server builder",
      options: [
        {
          type: 3,
          name: "preset",
          description: "⚡ Fast-track answers (free interview)",
          required: false,
          choices: [
            { name: "🎮 Gaming Community", value: "gaming" },
            { name: "💎 Crypto/Web3", value: "crypto" },
            { name: "🎥 Content Creator", value: "content" },
            { name: "💼 Professional", value: "professional" },
            { name: "🛡️ Support Server", value: "support" },
            { name: "💎 JustTheBuilder Support Server", value: "justthebuilder" }
          ]
        }
      ]
    },
    {
      type: 1,
      name: "restore",
      description: "Rebuild from a nuke backup JSON (or latest saved backup)",
      options: [
        {
          type: 11,
          name: "file",
          description: "Nuke safety backup JSON from your DMs (optional if bot still has it)",
          required: false
        }
      ]
    },
    { type: 1, name: "nuke", description: "☢️ Backup to DM, then delete ALL channels (DANGEROUS)" },
    {
      type: 1,
      name: "unlock",
      description: "Apply paid polish (roles, embeds, pins, tickets) from your saved interview"
    },
    {
      type: 1,
      name: "redeem",
      description: "Redeem a Ko-fi purchase code to your account (usable on any server you own)",
      options: [
        {
          type: 3,
          name: "code",
          description: "JTB-XXXXXX code from Ko-fi DM, or Ko-fi transaction ID from email",
          required: true
        }
      ]
    },
    {
      type: 1,
      name: "post-messages",
      description: "Post rules/about/FAQ embeds into existing channels"
    },
    {
      type: 1,
      name: "ticket-panel",
      description: "Post the support ticket category menu in #create-ticket"
    },
    {
      type: 1,
      name: "edit-channel",
      description: "Set channel topic or pin/unpin a message",
      options: [
        { type: 7, name: 'channel', description: 'The channel to edit', required: true },
        { type: 3, name: 'topic', description: 'New topic/description for the channel', required: false },
        { type: 3, name: 'pin-message', description: 'Message ID to pin in the channel', required: false },
        { type: 3, name: 'unpin-message', description: 'Message ID to unpin from the channel', required: false }
      ] 
    },
    {
      type: 1,
      name: "edit-message",
      description: "Edit a bot message/embed (requires unlock)",
      options: [
        { type: 7, name: 'channel', description: 'Channel containing the message', required: true },
        { type: 3, name: 'message_id', description: 'ID of the message to edit', required: true },
        { type: 3, name: 'title', description: 'New embed title', required: false },
        { type: 3, name: 'body', description: 'New embed body text', required: false }
      ]
    }
  ]
};

/**
 * Ephemeral confirm via buttons (reactions do not work on ephemeral messages).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {{ title: string, detail?: string }} opts
 * @returns {Promise<boolean>}
 */
async function confirmDestructive(interaction, { title, detail = "" }) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup_confirm_yes")
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("setup_confirm_no")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({
    ephemeral: true,
    content: `⚠️ **${title}**\n${detail}\n\nPress **Confirm** within 30 seconds, or **Cancel**.`,
    components: [row]
  });

  try {
    const msg = await interaction.fetchReply();
    const btn = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.user.id === interaction.user.id &&
        (i.customId === "setup_confirm_yes" || i.customId === "setup_confirm_no"),
      time: 30_000
    });
    const ok = btn.customId === "setup_confirm_yes";
    await btn.update({
      content: ok ? "✅ Confirmed. Working…" : "❌ Cancelled.",
      components: []
    });
    return ok;
  } catch {
    try {
      await interaction.editReply({ content: "⏱️ Timed out — cancelled.", components: [] });
    } catch {}
    return false;
  }
}

/**
 * Delete all channels in the guild (roles left intact to avoid lockout).
 * @param {import('discord.js').Guild} guild
 */
async function wipeServer(guild) {
  // Danger: simplistic wipe of channels (not roles to avoid lockout)
  for (const channel of guild.channels.cache.values()) {
    try { await channel.delete("Setup reset"); } catch {}
  }
}

/**
 * DM the freemium paywall summary + Apply free structure / Unlock full ($0.99) buttons
 * after an interview (or onboarding preview) completes. Guild id is embedded in each
 * button customId so DM clicks work after a bot restart.
 * @param {import('discord.js').User} user
 * @param {import('discord.js').Guild} guild
 */
export async function sendFreemiumPaywall(user, guild) {
  pendingPaywallGuild.set(user.id, guild.id);

  const ownerFree = isBotOwner(user.id);
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("Interview complete — choose how to build")
    .setDescription(
      ownerFree
        ? [
            `_${TAGLINE}_`,
            "",
            "You're the **bot owner** — unlock is free for you.",
            "",
            "✅ **Apply free structure** — channels/categories only (skeleton)",
            "🔓 **Unlock full setup** — roles, embeds, pins & tickets (recommended)",
            "",
            "Your answers are saved — no re-interview needed.",
            "",
            "Run **`/help`** in your server for the full command guide."
          ].join("\n")
        : [
            `_${TAGLINE}_`,
            "",
            "✅ **Free:** AI interview + category & channel layout (skeleton)",
            "🔒 **$0.99:** roles, permissions, embeds, pins & tickets — launch-ready",
            "",
            `[Buy on Ko-fi](${KOFI_BASIC_SHOP_URL}) or bot profile → \`/setup redeem\` → \`/setup unlock\``,
            "Your answers are saved — no re-interview needed.",
            "",
            "Run **`/help`** in your server for the full command guide."
          ].join("\n")
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`jtb_apply_structure:${guild.id}`)
      .setLabel("Apply free structure")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`jtb_unlock_polish:${guild.id}`)
      .setLabel(ownerFree ? "Unlock full setup (free)" : "Unlock full setup — $0.99")
      .setStyle(ButtonStyle.Primary)
  );

  try {
    await user.send({ embeds: [embed], components: [row] });
  } catch (err) {
    log(`sendFreemiumPaywall DM failed: ${err.message}`);
  }
}

/**
 * Apply the free channel/category structure from the guild's saved interview blueprint.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User} ownerUser
 */
export async function applyStructureForGuild(guild, ownerUser) {
  const blueprint = loadPersistedBlueprint(guild.id);
  if (!blueprint) throw new Error("No saved interview blueprint. Run /setup run first.");
  return applyBlueprint(guild, blueprint, { ownerUser, mode: "structure" });
}

/**
 * Apply paid polish/full build from the guild's saved interview blueprint, gated by entitlement.
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').User} ownerUser
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function applyPolishForInteraction(interaction, guild, ownerUser) {
  if (guildHasPolishApplied(guild.id)) {
    return {
      ok: true,
      message:
        "✅ This server already has the full unlock applied.\nUse `/setup post-messages` or `/setup ticket-panel` if you need to refresh embeds or tickets."
    };
  }

  const access = await canApplyPolish(interaction, guild);
  if (!access.allowed) {
    postAnalytics({
      event: "upgrade_denied",
      title: "🔒 Unlock denied",
      description: `**${guild.name}** — no pack, grant, or grandfather entitlement`,
      fields: [
        { name: "Guild", value: `\`${guild.id}\``, inline: true },
        { name: "User", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Source", value: interaction.isButton() ? "DM button" : "slash command", inline: true }
      ]
    });
    return {
      ok: false,
      message: buildUnlockDeniedMessage()
    };
  }

  const blueprint = loadPersistedBlueprint(guild.id);
  if (!blueprint) throw new Error("No saved interview blueprint.");

  const cfg = loadGuildConfig(guild.id);
  const mode = cfg.structureAppliedAt ? "polish" : "full";
  await applyBlueprint(guild, blueprint, { ownerUser, mode });

  if (access.reason === "pack") {
    const ent =
      access.packEntitlement ||
      findUnconsumedBasicPack(
        await fetchUserEntitlements(interaction.client, interaction.user.id, interaction.entitlements)
      );
    if (ent) await interaction.client.application.consumeEntitlement(ent.id);
    postAnalytics({
      event: "pack_consumed",
      title: "Basic pack consumed",
      fields: [{ name: "Guild", value: `\`${guild.id}\``, inline: true }]
    });
  }
  if (access.reason === "grandfather") {
    markGrandfatherFullUsed(guild.id);
    postAnalytics({
      event: "grandfather_used",
      title: "Grandfather full setup used",
      fields: [{ name: "Guild", value: `\`${guild.id}\``, inline: true }]
    });
  }
  if (access.reason === "manual_grant") {
    clearManualPolishGrant(guild.id);
    postAnalytics({
      event: "manual_polish_grant_used",
      title: "Manual polish grant used",
      fields: [{ name: "Guild", value: `\`${guild.id}\``, inline: true }]
    });
  }
  if (access.reason === "credit") {
    const remaining = consumePolishCredit(interaction.user.id);
    postAnalytics({
      event: "credit_consumed",
      title: "Unlock credit consumed",
      fields: [
        { name: "Guild", value: `\`${guild.id}\``, inline: true },
        { name: "User", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Credits left", value: String(remaining), inline: true }
      ]
    });
  }

  return {
    ok: true,
    message: "✅ **Launch-ready!** Roles, embeds, pins & tickets applied. Check your DMs for details."
  };
}

/**
 * Handle the jtb_apply_structure / jtb_unlock_polish DM buttons sent by sendFreemiumPaywall.
 * Guild id is parsed from the button customId (`action:guildId`); falls back to the
 * in-memory cache for legacy buttons without an embedded id.
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 * @returns {Promise<boolean>} true if this interaction was handled
 */
export async function handleFreemiumButtons(interaction, client) {
  if (!interaction.isButton()) return false;

  const id = interaction.customId;
  let action = null;
  let guildId = null;

  if (id.startsWith("jtb_apply_structure:")) {
    action = "structure";
    guildId = id.split(":")[1];
  } else if (id.startsWith("jtb_unlock_polish:")) {
    action = "polish";
    guildId = id.split(":")[1];
  } else if (id === "jtb_apply_structure" || id === "jtb_unlock_polish") {
    action = id === "jtb_apply_structure" ? "structure" : "polish";
    guildId = pendingPaywallGuild.get(interaction.user.id);
  } else {
    return false;
  }

  const guild = guildId ? client.guilds.cache.get(guildId) : null;
  if (!guild) {
    await interaction
      .reply({ ephemeral: true, content: "⚠️ Couldn't find your server. Run `/setup run` again." })
      .catch(() => {});
    return true;
  }

  let owner;
  try {
    owner = await guild.fetchOwner();
  } catch (err) {
    log(`fetchOwner failed for freemium button: ${err.message}`);
    await interaction.reply({ ephemeral: true, content: "⚠️ Couldn't verify server ownership." }).catch(() => {});
    return true;
  }
  if (interaction.user.id !== owner.id) {
    await interaction.reply({ ephemeral: true, content: "Owner only." }).catch(() => {});
    return true;
  }

  if (action === "structure") {
    await deferEphemeral(interaction, "🏗️ Applying your free structure…");
    try {
      await applyStructureForGuild(guild, owner.user);
      await replyEphemeral(interaction, "✅ Free structure applied! Check your server.");
    } catch (err) {
      log(`Apply structure button failed: ${err.message}`);
      if (!isInteractionTokenError(err)) {
        await replyEphemeral(interaction, `❌ Failed: ${err.message}`).catch(() => {});
      }
    }
    return true;
  }

  // polish unlock — defer before long applyBlueprint to keep webhook token valid
  await deferEphemeral(interaction, "🔓 Checking unlock status…");
  try {
    const result = await applyPolishForInteraction(interaction, guild, owner.user);
    await replyEphemeral(interaction, result.message);
  } catch (err) {
    log(`Unlock button failed: ${err.message}`);
    if (!isInteractionTokenError(err)) {
      await replyEphemeral(interaction, `❌ Failed: ${err.message}`).catch(() => {});
    }
  }
  return true;
}

/**
 * Handle /setup interactions with cooldowns and confirmations.
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 */
/**
 * Entry handler for /setup command interactions, performing cooldown checks
 * and dispatching subcommands.
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleSetupInteraction(interaction, client) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "setup") return;
  if (!interaction.guild) {
    return interaction.reply({ ephemeral: true, content: "This command only works in a server." }).catch(() => {});
  }

  const owner = await interaction.guild.fetchOwner();
  if (interaction.user.id !== owner.id) {
    return interaction.reply({ ephemeral: true, content: "Owner only." });
  }

  const sub = interaction.options.getSubcommand();

  const isOwner = isBotOwner(interaction.user.id);

  if (sub === "run") {
    const preset = interaction.options.getString("preset");

    // /setup run is free: the interview + free structure never require a pack/sub upfront.
    // Presets are also free — they only fast-track interview answers.

    // Check cooldowns
    const now = Date.now();
    const serverLast = serverCooldowns.get(interaction.guild.id) || 0;
    const userLast = userCooldowns.get(interaction.user.id) || 0;
    if (now - serverLast < SERVER_COOLDOWN_MS && !isOwner) {
      const wait = (((SERVER_COOLDOWN_MS - (now - serverLast)))/1000).toFixed(0);
      return interaction.reply({ ephemeral: true, content: `Server cooldown active. Try again in ${wait}s.` });
    }
    if (now - userLast < USER_COOLDOWN_MS && !isOwner) {
      const wait = (((USER_COOLDOWN_MS - (now - userLast)))/1000).toFixed(0);
      return interaction.reply({ ephemeral: true, content: `Your personal cooldown active. Try again in ${wait}s.` });
    }
    serverCooldowns.set(interaction.guild.id, now);
    userCooldowns.set(interaction.user.id, now);
    await interaction.reply({
      ephemeral: true,
      content: preset ? `🚀 Launching **${preset}**…` : "Launching free interview…"
    });
    try {
      if (!preset) {
        try {
          await owner.send("Re-running server setup interview.");
        } catch (dmErr) {
          log(`DM to owner failed: ${dmErr.message}`);
          await interaction.followUp({ ephemeral: true, content: "⚠️ Could not DM you — please enable DMs from server members and try again." });
          return;
        }
      }
      const result = await runInterview(owner.user, interaction.guild, client, preset, false);
      if (!result?.ok) {
        await interaction.followUp({ ephemeral: true, content: "Interview did not complete." });
        return;
      }
      await sendFreemiumPaywall(owner.user, interaction.guild);
    } catch (err) {
      log(`runInterview error: ${err.message}`);
      await interaction.followUp({ ephemeral: true, content: `❌ Something went wrong during setup: ${err.message}` });
    }
  } else if (sub === "unlock") {
    await deferEphemeral(interaction, "🔓 Checking unlock status…");
    try {
      const result = await applyPolishForInteraction(interaction, interaction.guild, owner.user);
      await replyEphemeral(interaction, result.message);
    } catch (err) {
      log(`unlock failed: ${err.message}`);
      if (!isInteractionTokenError(err)) {
        await replyEphemeral(interaction, `❌ Unlock failed: ${err.message}`).catch(() => {});
      }
    }
  } else if (sub === "redeem") {
    const { redeemKofiCode } = await import("../kofi/redeem.js");
    const result = await redeemKofiCode(interaction);
    await interaction.reply({ ephemeral: true, content: result.message });
  } else if (sub === "restore") {
    const attachment = interaction.options.getAttachment("file", false);
    let backupJson = null;
    if (attachment) {
      const name = attachment.name || "";
      const ctype = attachment.contentType || "";
      if (!/\.json$/i.test(name) && ctype && !/json/i.test(ctype)) {
        return interaction.reply({
          ephemeral: true,
          content: "❌ Please attach the nuke backup **.json** file from your DMs."
        });
      }
      try {
        const res = await fetch(attachment.url);
        if (!res.ok) throw new Error(`download failed (${res.status})`);
        backupJson = await res.json();
      } catch (err) {
        return interaction.reply({
          ephemeral: true,
          content: `❌ Couldn't read that file: ${err.message}`
        });
      }
    }

    const prepared = prepareRestoreBlueprint(interaction.guild.id, backupJson);
    if (!prepared.ok) {
      return interaction.reply({ ephemeral: true, content: `❌ ${prepared.error}` });
    }

    const { blueprint, stats, source } = prepared;
    const existingChannels = interaction.guild.channels.cache.filter(
      (c) => c.type !== ChannelType.GuildCategory
    ).size;
    const confirmed = await confirmDestructive(interaction, {
      title: "Restore server layout from backup?",
      detail: [
        `Source: \`${source}\``,
        `Will create **${stats.categoryCount}** categories · **${stats.channelCount}** channels · **${stats.roleCount}** roles (existing roles reused).`,
        stats.mergedMessages
          ? `Merged **${stats.mergedMessages}** embed(s) from your saved interview.`
          : "No saved interview embeds found — channels may restore empty until you unlock / post-messages.",
        existingChannels > 0
          ? `⚠️ This server already has **${existingChannels}** channel(s). Prefer \`/setup nuke\` first or you'll get duplicates.`
          : "Server looks empty — good to restore.",
        "",
        "Free: structure only. With unlock/credit: full polish (embeds, perms, tickets)."
      ].join("\n")
    });
    if (!confirmed) return;

    try {
      persistBlueprintOnly(interaction.guild.id, blueprint);
      saveGuildConfig(interaction.guild.id, {
        ...loadGuildConfig(interaction.guild.id),
        lastBlueprint: blueprint
      });

      const alreadyPolished = guildHasPolishApplied(interaction.guild.id);
      const access = await canApplyPolish(interaction, interaction.guild);
      const canFull = alreadyPolished || access.allowed || isOwner;

      if (canFull) {
        await applyBlueprint(interaction.guild, blueprint, {
          ownerUser: owner.user,
          mode: "full"
        });
        if (!alreadyPolished && access.allowed && access.reason !== "owner") {
          if (access.reason === "grandfather") markGrandfatherFullUsed(interaction.guild.id);
          if (access.reason === "manual_grant") clearManualPolishGrant(interaction.guild.id);
          if (access.reason === "credit") consumePolishCredit(interaction.user.id);
          if (access.reason === "pack") {
            const ent =
              access.packEntitlement ||
              findUnconsumedBasicPack(
                await fetchUserEntitlements(
                  interaction.client,
                  interaction.user.id,
                  interaction.entitlements
                )
              );
            if (ent) await interaction.client.application.consumeEntitlement(ent.id);
          }
        }
        await interaction.followUp({
          ephemeral: true,
          content:
            "✅ **Restore complete** (full layout). Blueprint saved — check your DMs for build details."
        });
      } else {
        await applyBlueprint(interaction.guild, blueprint, {
          ownerUser: owner.user,
          mode: "structure"
        });
        await sendFreemiumPaywall(owner.user, interaction.guild);
        await interaction.followUp({
          ephemeral: true,
          content:
            "✅ Restored **free structure**. Unlock ($0.99) for embeds & tickets — buttons are in your DMs."
        });
      }
    } catch (err) {
      log(`restore failed: ${err.message}`);
      await interaction
        .followUp({ ephemeral: true, content: `❌ Restore failed: ${err.message}` })
        .catch(() => {});
    }
  } else if (sub === "nuke") {
    const confirmed = await confirmDestructive(interaction, {
      title: "Delete ALL channels?",
      detail:
        "A JSON backup will be sent to your DMs first. Roles are kept so you are not locked out. Then run `/setup restore` (attach the JSON) or `/setup run` to rebuild."
    });
    if (!confirmed) return;

    await interaction.followUp({ ephemeral: true, content: "📦 Creating safety backup before nuke..." });
    
    try {
      const data = await exportGuild(interaction.guild);
      const backupDir = path.resolve('data', 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const filePath = path.join(backupDir, `nuke-${interaction.guild.id}-${Date.now()}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      
      await interaction.user.send({
        content: [
          "☢️ **Nuke Safety Backup**",
          "Server state before wipe.",
          "",
          "**To rebuild with the same layout:** run `/setup restore` in your server and attach this file (or run it with no file if the bot still has the backup)."
        ].join("\n"),
        files: [ filePath ]
      });
      await interaction.followUp({ ephemeral: true, content: "✅ Backup secured in DMs." });
    } catch (err) {
      log(`Nuke backup failed: ${err.message}`);
      return interaction.followUp({ ephemeral: true, content: `❌ Backup failed (${err.message}). Nuke aborted for safety.` });
    }

    await interaction.followUp({ ephemeral: true, content: "☢️ **NUKING CHANNELS**..." }).catch(() => {});
    await wipeServer(interaction.guild);
    try {
      await interaction.user.send(
        "💀 **Nuke complete.** Run `/setup restore` with the backup JSON, or `/setup run` for a fresh interview."
      );
    } catch (err) {
      log(`Nuke done but DM failed: ${err.message}`);
    }
  } else if (sub === "post-messages") {
    const access = await canApplyPolish(interaction, interaction.guild);
    const polished = guildHasPolishApplied(interaction.guild.id);
    if (!access.allowed && !polished && !isBotOwner(interaction.user.id)) {
      return interaction.reply({
        ephemeral: true,
        content: "💎 That command needs a completed full unlock ($0.99 pack) on this server.",
      });
    }

    const filePath = path.resolve("data", "blueprints", `${interaction.guild.id}.json`);
    const cfg = loadGuildConfig(interaction.guild.id);
    const bp = cfg.lastBlueprint || (fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : null);
    if (!bp) {
      return interaction.reply({
        ephemeral: true,
        content: "No blueprint found. Run `/setup run` first."
      });
    }
    await interaction.reply({ ephemeral: true, content: "Posting embeds into existing channels…" });
    try {
      const results = await postMessagesToExistingChannels(interaction.guild, bp, interaction.user);
      const summary =
        results.posted.length > 0
          ? `✅ Posted ${results.posted.length} embed(s)${results.pinned.length ? `, pinned ${results.pinned.length}` : ""}.`
          : "No embeds were posted.";
      const failNote = results.failed.length ? `\n⚠️ Failed: ${results.failed.join("; ")}` : "";
      await interaction.followUp({ ephemeral: true, content: summary + failNote });
    } catch (err) {
      log(`post-messages failed: ${err.message}`);
      await interaction.followUp({ ephemeral: true, content: `❌ Failed: ${err.message}` });
    }
  } else if (sub === "ticket-panel") {
    const access = await canApplyPolish(interaction, interaction.guild);
    const polished = guildHasPolishApplied(interaction.guild.id);
    if (!access.allowed && !polished && !isBotOwner(interaction.user.id)) {
      return interaction.reply({
        ephemeral: true,
        content: "💎 That command needs a completed full unlock ($0.99 pack) on this server.",
      });
    }

    await interaction.reply({ ephemeral: true, content: "Posting support ticket panel…" });
    try {
      const { getTicketConfig, saveTicketConfig, buildTicketsConfigFromInterview } = await import(
        "../tickets/config.js"
      );
      const { deployTicketPanelInGuild } = await import("../tickets/handler.js");
      let config = getTicketConfig(interaction.guild.id);
      if (!config) {
        const bpPath = path.resolve("data", "blueprints", `${interaction.guild.id}.json`);
        if (fs.existsSync(bpPath)) {
          const bp = JSON.parse(fs.readFileSync(bpPath, "utf-8"));
          config = bp.tickets;
        }
      }
      if (!config?.enabled) {
        config = buildTicketsConfigFromInterview(
          ["", "", "", "", "", "", "Admin, Moderator", "", "", "yes", ""],
          (await import("../ai/interviewConfig.js")).A
        );
        saveTicketConfig(interaction.guild.id, config, null);
      }
      const ok = config?.enabled && (await deployTicketPanelInGuild(interaction.guild, client));
      await interaction.followUp({
        ephemeral: true,
        content: ok
          ? "✅ Ticket panel is live — **anyone** can pick a category and open a ticket. Staff roles are pinged automatically."
          : "❌ No ticket channel found. Run `/setup run` with tickets enabled, or create `#create-ticket`."
      });
    } catch (err) {
      log(`ticket-panel failed: ${err.message}`);
      await interaction.followUp({ ephemeral: true, content: `❌ Failed: ${err.message}` });
    }
  } else if (sub === 'edit-channel') {
    const channel = interaction.options.getChannel('channel');
    const topic = interaction.options.getString('topic');
    const pinMessageId = interaction.options.getString('pin-message');
    const unpinMessageId = interaction.options.getString('unpin-message');

    if (!topic && !pinMessageId && !unpinMessageId) {
      return interaction.reply({ ephemeral: true, content: 'Please provide at least one option: topic, pin-message, or unpin-message.' });
    }

    await interaction.reply({ ephemeral: true, content: 'Processing channel edit…' });
    const results = [];

    // Edit channel topic/description
    if (topic) {
      try {
        if (!channel.isTextBased()) {
          results.push('⚠️ Topic can only be set on text-based channels.');
        } else {
          await channel.setTopic(topic);
          results.push(`✅ Topic updated to: "${topic}"`);
        }
      } catch (err) {
        log(`Edit channel topic failed: ${err.message}`);
        results.push(`❌ Failed to update topic: ${err.message}`);
      }
    }

    // Pin a message
    if (pinMessageId) {
      try {
        if (!channel.isTextBased()) {
          results.push('⚠️ Can only pin messages in text-based channels.');
        } else {
          const message = await channel.messages.fetch(pinMessageId);
          await message.pin();
          results.push(`📌 Message ${pinMessageId} pinned.`);
        }
      } catch (err) {
        log(`Pin message failed: ${err.message}`);
        results.push(`❌ Failed to pin message: ${err.message}`);
      }
    }

    // Unpin a message
    if (unpinMessageId) {
      try {
        if (!channel.isTextBased()) {
          results.push('⚠️ Can only unpin messages in text-based channels.');
        } else {
          const message = await channel.messages.fetch(unpinMessageId);
          await message.unpin();
          results.push(`🔓 Message ${unpinMessageId} unpinned.`);
        }
      } catch (err) {
        log(`Unpin message failed: ${err.message}`);
        results.push(`❌ Failed to unpin message: ${err.message}`);
      }
    }

    await interaction.followUp({ ephemeral: true, content: results.join('\n') });
  } else if (sub === 'edit-message') {
    const access = await canApplyPolish(interaction, interaction.guild);
    const polished = guildHasPolishApplied(interaction.guild.id);
    if (!access.allowed && !polished && !isBotOwner(interaction.user.id)) {
      return interaction.reply({
        ephemeral: true,
        content: "💎 That command needs a completed full unlock ($0.99 pack) on this server.",
      });
    }

    const channel = interaction.options.getChannel('channel');
    const msgId = interaction.options.getString('message_id');
    const title = interaction.options.getString('title');
    const body = interaction.options.getString('body');

    if (!channel.isTextBased()) return interaction.reply({ ephemeral: true, content: "Channel must be text-based." });
    
    await interaction.reply({ ephemeral: true, content: "Fetching message..." });
    try {
      const msg = await channel.messages.fetch(msgId);
      if (!msg) return interaction.followUp({ ephemeral: true, content: "Message not found." });
      if (msg.author.id !== client.user.id) return interaction.followUp({ ephemeral: true, content: "I can only edit my own messages." });

      const oldEmbed = msg.embeds[0];
      const newEmbed = {
        title: title || oldEmbed?.title,
        description: body || oldEmbed?.description,
        color: oldEmbed?.color,
        footer: oldEmbed?.footer,
        fields: oldEmbed?.fields,
        image: oldEmbed?.image,
        thumbnail: oldEmbed?.thumbnail
      };

      if (!newEmbed.title && !newEmbed.description) {
        return interaction.followUp({ ephemeral: true, content: "❌ You must provide a title or body to create/edit an embed." });
      }

      await msg.edit({ embeds: [newEmbed] });
      await interaction.followUp({ ephemeral: true, content: "✅ Message updated." });
    } catch (err) {
      log(`Edit message failed: ${err.message}`);
      await interaction.followUp({ ephemeral: true, content: `Failed: ${err.message}` });
    }
  }
}

/**
 * Best-effort export of current guild structure into blueprint shape.
 * @param {import('discord.js').Guild} guild
 */
/**
 * Best-effort export of current guild structure into blueprint-like JSON.
 * Includes roles, categories, channels, topics, NSFW flags, rate limits, webhooks, permission overwrites
 * and heuristic mapping to known permission presets.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<object>}
 */
async function exportGuild(guild) {
  // Roles (excluding @everyone and managed)
  const roles = guild.roles.cache.filter(r => !r.managed && r.name !== '@everyone').map(r => ({
    name: r.name,
    permissions: r.permissions.toArray(),
    color: r.color ? '#' + r.color.toString(16).padStart(6, '0') : undefined,
    position: r.position
  }));
  // Categories and channels
  const categories = [];
  guild.channels.cache.forEach(ch => {
    if (ch.type === ChannelType.GuildCategory) {
      const catChannels = guild.channels.cache.filter(c => c.parentId === ch.id);
      const channels = catChannels.map(c => {
        const base = {
          name: c.name,
          type: mapChannelType(c.type),
        };
        if ('topic' in c && c.topic) base.topic = c.topic;
        if ('nsfw' in c && c.nsfw) base.nsfw = true;
        if ('rateLimitPerUser' in c && c.rateLimitPerUser) base.slowmode = c.rateLimitPerUser;
        if (c.type === ChannelType.GuildForum && c.defaultAutoArchiveDuration) base.defaultAutoArchiveDuration = c.defaultAutoArchiveDuration;
        // Permission overwrites export
        if (c.permissionOverwrites?.cache?.size) {
          base.overwrites = c.permissionOverwrites.cache.map(po => ({
            id: po.id,
            type: po.type,
            allow: po.allow.toArray(),
            deny: po.deny.toArray()
          }));
          const preset = inferPreset(base.overwrites, guild);
          if (preset) base.permissionsPreset = preset;
        }
        return base;
      });
      categories.push({ name: ch.name, channels });
    }
  });
  const savedBlueprint = loadPersistedBlueprint(guild.id);
  const branding =
    loadGuildConfig(guild.id).lastBlueprint?.branding || savedBlueprint?.branding || undefined;
  // Enrich channels with webhooks (best effort)
  for (const cat of categories) {
    for (const ch of cat.channels) {
      const real = guild.channels.cache.find(rc => rc.name === ch.name && rc.parent?.name === cat.name);
      if (real && real.isTextBased()) {
        try {
          const hooks = await real.fetchWebhooks();
          if (hooks.size) ch.webhooks = hooks.map(h => ({ name: h.name, id: h.id }));
        } catch {}
      }
    }
  }
  // Embed interview blueprint so /setup restore works from the DM file alone.
  return {
    name: guild.name,
    roles,
    categories,
    branding,
    blueprint: savedBlueprint || undefined
  };
}

/**
 * Map Discord.js channel type codes to blueprint textual types.
 * @param {number} t
 * @returns {string}
 */
function mapChannelType(t) {
  switch (t) {
    case ChannelType.GuildText: return 'text';
    case ChannelType.GuildVoice: return 'voice';
    case ChannelType.GuildAnnouncement: return 'announcement';
    case ChannelType.GuildForum: return 'forum';
    default: return 'text';
  }
}

/** Known preset heuristics definition */
const PRESET_HEURISTICS = [
  {
    name: 'public-readonly',
    test: overwrites => {
      const everyone = overwrites.find(o => o.id === overwrites.__everyoneId);
      if (!everyone) return false;
      const canView = everyone.allow.includes('ViewChannel');
      const deniesSend = everyone.deny.includes('SendMessages');
      return canView && deniesSend;
    }
  },
  {
    name: 'announcement-lock',
    test: overwrites => {
      const everyone = overwrites.find(o => o.id === overwrites.__everyoneId);
      if (!everyone) return false;
      const deniesSend = everyone.deny.includes('SendMessages');
      const staff = overwrites.find(o => o.allow.includes('SendMessages') && o.id !== overwrites.__everyoneId);
      return deniesSend && !!staff;
    }
  },
  {
    name: 'staff-private',
    test: overwrites => {
      const everyone = overwrites.find(o => o.id === overwrites.__everyoneId);
      if (!everyone) return false;
      const deniesView = everyone.deny.includes('ViewChannel');
      const staff = overwrites.find(o => o.allow.includes('ViewChannel') && o.id !== overwrites.__everyoneId);
      return deniesView && !!staff;
    }
  }
];

/**
 * Infer a permissionsPreset from raw overwrites if it matches heuristic patterns.
 * @param {Array<{id:string,type:number,allow:string[],deny:string[]}>} overwrites
 * @param {import('discord.js').Guild} guild
 * @returns {string|undefined}
 */
function inferPreset(overwrites, guild) {
  if (!overwrites?.length) return undefined;
  // Attach everyone id for heuristics
  overwrites.__everyoneId = guild.roles.everyone.id;
  for (const p of PRESET_HEURISTICS) {
    try { if (p.test(overwrites)) return p.name; } catch {}
  }
  return undefined;
}
