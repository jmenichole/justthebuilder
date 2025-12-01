import { createRoles } from "./roles.js";
import { createChannels } from "./builder/channels.js";
import { postMessages } from "./builder/messages.js";
import { applyCommunityFeatures } from "./builder/community.js";
import { log } from "./logger.js";
import { sendProgress } from "./progress.js";
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
 * @returns {Promise<{roleMap:Object,channelMap:Object,metrics:{buildSeconds:string,categoryCount:number,channelCount:number,roleCount:number}}>} Build artifacts & metrics
 */
export async function applyBlueprint(guild, blueprint, { ownerUser } = {}) {
  const start = Date.now();
  log("Starting applyBlueprint...");
  if (ownerUser) await sendProgress(ownerUser, "Creating roles…");
  const roleMap = await createRoles(guild, blueprint.roles);

  if (ownerUser) await sendProgress(ownerUser, "Creating categories…");
  // Categories are created inside createChannels; message indicates this phase.
  if (ownerUser) await sendProgress(ownerUser, "Building channels…");
  const { channelMap } = await createChannels(guild, blueprint, roleMap, ownerUser);

  if (ownerUser) await sendProgress(ownerUser, "Posting about/rules/FAQ…");
  await postMessages(guild, channelMap, blueprint);

  if (ownerUser) await sendProgress(ownerUser, "Applying community features…");
  await applyCommunityFeatures(guild, blueprint, channelMap);

  if (ownerUser) await sendProgress(ownerUser, "Finalizing setup…");

  const end = Date.now();
  const buildSeconds = ((end - start) / 1000).toFixed(2);
  const categoryCount = Object.keys(blueprint.categories || {}).length;
  const channelCount = Object.values(blueprint.categories || {}).reduce((a, arr) => a + arr.length, 0);
  const roleCount = blueprint.roles?.length || 0;

  persistBlueprint(guild.id, blueprint, { buildSeconds, categoryCount, channelCount, roleCount });
  logUsage(guild.id, { buildSeconds, categoryCount, channelCount, roleCount });

  if (ownerUser) {
    await sendProgress(
      ownerUser,
      `🎉 Your server is ready!\n⏱️ Build time: ${buildSeconds} seconds\n📁 Categories: ${categoryCount}\n📄 Channels: ${channelCount}\n🧩 Roles: ${roleCount}\n\nRerun: /setup run\nSave as template: /setup save-template <name>`
    );
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

  log("applyBlueprint complete.");
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
