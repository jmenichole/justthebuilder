import { createRoles } from "./roles.js";
import { createChannels, mapExistingChannelsFromBlueprint, applyTopicsAndPermissions, applyPolishExtras } from "./builder/channels.js";
import { postMessages } from "./builder/messages.js";
import { applyCommunityFeatures } from "./builder/community.js";
import { log } from "./logger.js";
import { sendProgress } from "./progress.js";
import { saveTicketConfig } from "./tickets/config.js";
import { deployTicketPanelForGuild } from "./tickets/handler.js";
import { loadGuildConfig, saveGuildConfig } from "./storage/guildConfig.js";
import { postAnalytics } from "./ops.js";
import { STRUCTURE_UPSELL } from "../config/marketing.js";
import fs from "fs";
import path from "path";

/**
 * Apply a validated blueprint to a guild.
 */
/**
 * Orchestrates building the guild from a validated blueprint.
 * Sends progress updates to the owner if provided.
 * @param {import('discord.js').Guild} guild
 * @param {Object} blueprint Validated blueprint object
 * @param {Object} options Additional options
 * @param {import('discord.js').User} [options.ownerUser] Owner user for progress DMs
 * @param {'structure'|'full'|'polish'} [options.mode='full'] Build mode:
 *   - structure: free tier — categories + channel names only, no roles/topics/perms/embeds/tickets
 *   - full: everything in one pass (roles, channels w/ topics+perms, messages, community, tickets)
 *   - polish: upgrade pass on top of an existing free structure — roles, topics, perms, messages, community, tickets
 * @returns {Promise<{roleMap:Object,channelMap:Object,metrics:{buildSeconds:string,categoryCount:number,channelCount:number,roleCount:number}}>} Build artifacts & metrics
 */
export async function applyBlueprint(guild, blueprint, { ownerUser, mode = "full" } = {}) {
  const start = Date.now();
  log(`Starting applyBlueprint (mode=${mode})...`);

  let roleMap = {};
  let channelMap = {};
  let messageResults = { posted: [], failed: [] };

  if (mode === "structure") {
    if (ownerUser) await sendProgress(ownerUser, "Building your free structure…");
    const result = await createChannels(guild, blueprint, roleMap, ownerUser, {
      includeTopics: false,
      includeWebhooks: false,
      skipPermissions: true
    });
    channelMap = result.channelMap;
  } else if (mode === "polish") {
    if (ownerUser) await sendProgress(ownerUser, "Creating roles…");
    roleMap = await createRoles(guild, blueprint.roles);

    if (ownerUser) await sendProgress(ownerUser, "Mapping existing channels…");
    channelMap = await mapExistingChannelsFromBlueprint(guild, blueprint);

    const expectedChannelCount = Object.values(blueprint.categories || {}).reduce((a, arr) => a + arr.length, 0);
    const mappedChannelCount = Object.keys(channelMap).length;
    if (mappedChannelCount < expectedChannelCount) {
      const missingCount = expectedChannelCount - mappedChannelCount;
      log(`Channel mapping incomplete for guild ${guild.id}: expected ${expectedChannelCount}, mapped ${mappedChannelCount} (missing ${missingCount})`);
      if (ownerUser) {
        await sendProgress(
          ownerUser,
          `⚠️ Couldn't match ${missingCount} of ${expectedChannelCount} channel(s) from your original structure (renamed/deleted?) — polish will apply to the ${mappedChannelCount} channel(s) found.`
        );
      }
    }

    if (ownerUser) await sendProgress(ownerUser, "Polishing channels…");
    await applyTopicsAndPermissions(guild, blueprint, channelMap, roleMap, ownerUser);
    await applyPolishExtras(guild, blueprint, channelMap, roleMap, ownerUser);

    if (ownerUser) await sendProgress(ownerUser, "Posting about/rules/FAQ…");
    messageResults = await postMessages(guild, channelMap, blueprint, ownerUser);

    if (ownerUser) await sendProgress(ownerUser, "Applying community features…");
    await applyCommunityFeatures(guild, blueprint, channelMap);
  } else {
    // full
    if (ownerUser) await sendProgress(ownerUser, "Creating roles…");
    roleMap = await createRoles(guild, blueprint.roles);

    if (ownerUser) await sendProgress(ownerUser, "Creating categories…");
    // Categories are created inside createChannels; message indicates this phase.
    if (ownerUser) await sendProgress(ownerUser, "Building channels…");
    const result = await createChannels(guild, blueprint, roleMap, ownerUser);
    channelMap = result.channelMap;

    if (ownerUser) await sendProgress(ownerUser, "Posting about/rules/FAQ…");
    messageResults = await postMessages(guild, channelMap, blueprint, ownerUser);

    if (ownerUser) await sendProgress(ownerUser, "Applying community features…");
    await applyCommunityFeatures(guild, blueprint, channelMap);
  }

  if ((mode === "full" || mode === "polish") && blueprint.tickets?.enabled) {
    if (ownerUser) await sendProgress(ownerUser, "Setting up support ticket panel…");
    saveTicketConfig(guild.id, blueprint.tickets, blueprint);
    try {
      await deployTicketPanelForGuild(guild, guild.client, blueprint.tickets, {
        forceNew: blueprint.lastPreset === "justthebuilder"
      });
    } catch (err) {
      log(`Ticket panel deploy failed: ${err.message}`);
      if (ownerUser) await sendProgress(ownerUser, `⚠️ Ticket panel failed: ${err.message}`);
    }
  }

  if (ownerUser) await sendProgress(ownerUser, "Finalizing setup…");

  const end = Date.now();
  const buildSeconds = ((end - start) / 1000).toFixed(2);
  const categoryCount = Object.keys(blueprint.categories || {}).length;
  const channelCount = Object.values(blueprint.categories || {}).reduce((a, arr) => a + arr.length, 0);
  const roleCount = mode === "structure" ? 0 : blueprint.roles?.length || 0;

  persistBlueprint(guild.id, blueprint, { buildSeconds, categoryCount, channelCount, roleCount, mode });
  logUsage(guild.id, { buildSeconds, categoryCount, channelCount, roleCount, mode });

  try {
    const cfg = loadGuildConfig(guild.id);
    const nowIso = new Date().toISOString();
    if (mode === "structure") {
      saveGuildConfig(guild.id, { ...cfg, structureAppliedAt: nowIso });
    } else {
      saveGuildConfig(guild.id, {
        ...cfg,
        polishAppliedAt: nowIso,
        structureAppliedAt: cfg.structureAppliedAt || nowIso
      });
    }
  } catch (err) {
    log(`Guild config patch failed: ${err.message}`);
  }

  try {
    postAnalytics({
      event: mode === "structure" ? "structure_applied" : "polish_applied",
      title:
        mode === "structure"
          ? "🆓 Free structure applied"
          : mode === "polish"
            ? "✨ Polish applied"
            : "🎉 Full build applied",
      description: `**${guild.name}**`,
      fields: [
        { name: "Guild ID", value: `\`${guild.id}\``, inline: true },
        { name: "Mode", value: mode, inline: true },
        { name: "Channels", value: String(channelCount), inline: true }
      ]
    });
  } catch (err) {
    log(`postAnalytics failed: ${err.message}`);
  }

  try {
    const { logStaffBuildComplete } = await import("./staffLog.js");
    logStaffBuildComplete(guild.client, guild, { buildSeconds, categoryCount, channelCount, roleCount }, ownerUser, blueprint);
  } catch (err) {
    log(`staffLog build: ${err.message}`);
  }

  if (ownerUser) {
    if (mode === "structure") {
      await sendProgress(
        ownerUser,
        `⏱️ ${buildSeconds}s · 📁 ${categoryCount} categories · 📄 ${channelCount} channels\n\n${STRUCTURE_UPSELL}`
      );
    } else {
      const embedNote =
        messageResults.failed.length > 0
          ? `\n⚠️ ${messageResults.failed.length} embed(s) failed to post — see messages above.`
          : messageResults.posted.length
            ? `\n📝 Embeds posted: ${messageResults.posted.length}`
            : "";
      const heading = mode === "polish" ? "🎉 Your server has been polished!" : "🎉 Your server is ready!";
      await sendProgress(
        ownerUser,
        `${heading}\n⏱️ Build time: ${buildSeconds} seconds\n📁 Categories: ${categoryCount}\n📄 Channels: ${channelCount}\n🧩 Roles: ${roleCount}${embedNote}${blueprint.tickets?.enabled ? "\n🎟️ Tickets: #create-ticket (Support & Bugs · Billing · Feature)" : ""}\n\nRecovery only: /setup post-messages or /setup ticket-panel`
      );
    }
  }

  // Post-onboarding server message in a general channel
  try {
    const general = guild.channels.cache.find(c => c.name.includes('general') && c.type === 0) ||
      guild.channels.cache.find(c => c.type === 0);
    if (general) {
      await general.send('✨ Your server was built by JustTheBuilder. Use /setup run to customize or rerun.');
    }
  } catch (err) {
    log(`General channel post failed: ${err.message}`);
  }

  log(`applyBlueprint complete (mode=${mode}).`);
  return { roleMap, channelMap, metrics: { buildSeconds, categoryCount, channelCount, roleCount } };
}

/**
 * Persist blueprint & build metadata for rollback/reapply/export.
 * @param {string} guildId
 * @param {Object} blueprint
 * @param {Object} metrics
 */
/**
 * Persist blueprint & build metadata for rollback/reapply/export.
 * @param {string} guildId
 * @param {Object} blueprint
 * @param {{buildSeconds:string,categoryCount:number,channelCount:number,roleCount:number}} metrics
 */
function persistBlueprint(guildId, blueprint, metrics) {
  try {
    const baseDir = path.resolve("data");
    const bpDir = path.join(baseDir, "blueprints");
    const buildsDir = path.join(baseDir, "builds");
    for (const d of [baseDir, bpDir, buildsDir]) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }
    fs.writeFileSync(path.join(bpDir, `${guildId}.json`), JSON.stringify(blueprint, null, 2));
    fs.writeFileSync(path.join(buildsDir, `${guildId}.json`), JSON.stringify({ metrics, timestamp: new Date().toISOString() }, null, 2));
    log(`Persisted blueprint & build metrics for guild ${guildId}`);
  } catch (err) {
    log(`Persist failed: ${err.message}`);
  }
}

/**
 * Persist just the blueprint JSON (no build metrics) for a guild.
 * Used by the free interview path, which saves the interview result
 * before any structure/polish build has run.
 * @param {string} guildId
 * @param {Object} blueprint
 */
export function persistBlueprintOnly(guildId, blueprint) {
  try {
    const bpDir = path.resolve("data", "blueprints");
    if (!fs.existsSync(bpDir)) fs.mkdirSync(bpDir, { recursive: true });
    fs.writeFileSync(path.join(bpDir, `${guildId}.json`), JSON.stringify(blueprint, null, 2));
    log(`Persisted blueprint (no metrics) for guild ${guildId}`);
  } catch (err) {
    log(`Persist blueprint only failed: ${err.message}`);
  }
}

/**
 * Load a previously persisted blueprint for a guild, if any.
 * @param {string} guildId
 * @returns {Object|null}
 */
export function loadPersistedBlueprint(guildId) {
  try {
    const file = path.resolve("data", "blueprints", `${guildId}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    log(`Load persisted blueprint failed: ${err.message}`);
    return null;
  }
}

/**
 * Append usage metrics line to builds.log for analytics.
 * @param {string} guildId
 * @param {{buildSeconds:string,categoryCount:number,channelCount:number,roleCount:number}} metrics
 */
function logUsage(guildId, metrics) {
  try {
    const logsDir = path.resolve("logs");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const entry = { guildId, timestamp: new Date().toISOString(), metrics };
    fs.appendFileSync(path.join(logsDir, "builds.log"), JSON.stringify(entry) + "\n");
  } catch (err) {
    log(`Usage log failed: ${err.message}`);
  }
}
