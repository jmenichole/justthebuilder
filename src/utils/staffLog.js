import { EmbedBuilder } from "discord.js";
import { log } from "./logger.js";

const queue = [];
let draining = false;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve #staff-logs in the support server (STAFF_LOG_CHANNEL_ID or SUPPORT_GUILD_ID).
 * @param {import('discord.js').Client} client
 */
async function resolveStaffLogChannel(client) {
  const channelId = process.env.STAFF_LOG_CHANNEL_ID?.trim();
  if (channelId) {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (ch?.isTextBased?.()) return ch;
  }

  const guildId = process.env.SUPPORT_GUILD_ID?.trim();
  if (!guildId) return null;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  await guild.channels.fetch().catch(() => {});
  const ch = guild.channels.cache.find(
    (c) => c.isTextBased?.() && /staff-?logs/i.test(c.name)
  );
  return ch || null;
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
function commandDetailFromInteraction(interaction) {
  const parts = [];
  const sub = interaction.options.getSubcommand(false);
  if (sub) parts.push(`sub: \`${sub}\``);
  const preset = interaction.options.getString("preset", false);
  if (preset) parts.push(`preset: \`${preset}\``);
  const template = interaction.options.getString("template", false);
  if (template) parts.push(`template: \`${template}\``);
  const target = interaction.options.getString("target", false);
  if (target) parts.push(`target: \`${target}\``);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Post usage to support #staff-logs (queued; never throws to callers).
 * @param {import('discord.js').Client} client
 * @param {{
 *   action: string,
 *   guild?: import('discord.js').Guild | null,
 *   user?: import('discord.js').User | null,
 *   detail?: string | null,
 *   color?: number
 * }} entry
 */
export function logStaffUsage(client, entry) {
  if (!client) return;
  queue.push(() => sendStaffLog(client, entry));
  void drainQueue();
}

async function drainQueue() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      await job();
    } catch (err) {
      log(`staffLog job failed: ${err.message}`);
    }
    await delay(450);
  }
  draining = false;
}

async function sendStaffLog(client, entry) {
  const channel = await resolveStaffLogChannel(client);
  if (!channel) {
    if (!sendStaffLog._warnedMissing) {
      sendStaffLog._warnedMissing = true;
      log("staffLog: set SUPPORT_GUILD_ID (and #staff-logs) or STAFF_LOG_CHANNEL_ID");
    }
    return;
  }

  const { action, guild, user, detail, color = 0x5865f2 } = entry;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(action)
    .setTimestamp();

  const fields = [];
  if (guild) {
    fields.push({
      name: "Server",
      value: `**${guild.name}**\n\`${guild.id}\``,
      inline: true
    });
  }
  if (user) {
    fields.push({
      name: "User",
      value: `**${user.tag}**\n\`${user.id}\``,
      inline: true
    });
  }
  if (fields.length) embed.addFields(fields);
  if (detail) embed.setDescription(detail.slice(0, 4000));

  await channel.send({ embeds: [embed] });
}

/**
 * Log slash command usage (any server).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export function logStaffSlashCommand(interaction) {
  // /help is high-volume noise — skip staff channel logging.
  if (interaction.commandName === "help") return;

  const sub = interaction.options.getSubcommand(false);
  const action = sub
    ? `\`/${interaction.commandName} ${sub}\``
    : `\`/${interaction.commandName}\``;
  const extra = commandDetailFromInteraction(interaction);

  logStaffUsage(interaction.client, {
    action: `Command ${action}`,
    guild: interaction.guild,
    user: interaction.user,
    detail: extra
  });
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {{ buildSeconds: string, categoryCount: number, channelCount: number, roleCount: number }} metrics
 * @param {import('discord.js').User} [ownerUser]
 * @param {Object} [blueprint]
 */
/**
 * Post-build survey result (bugs, missing features, praise).
 * @param {import('discord.js').Client} client
 * @param {{
 *   guild: import('discord.js').Guild,
 *   user: import('discord.js').User,
 *   outcome: string,
 *   details?: string,
 *   preset?: string | null,
 *   customRequest?: string | null,
 *   metrics?: object | null
 * }} data
 */
export function logStaffPostBuildSurvey(client, data) {
  const { guild, user, outcome, details, preset, customRequest, metrics } = data;
  const outcomeLabels = {
    great: "⭐ Great",
    good: "👍 Good (minor tweaks)",
    issues: "⚠️ Missing / wrong layout",
    bug: "🐛 Bug report",
    skip: "Skipped"
  };
  const isProblem = outcome === "bug" || outcome === "issues";
  const lines = [
    `**Outcome:** ${outcomeLabels[outcome] || outcome}`,
    preset ? `**Preset:** \`${preset}\`` : "**Preset:** custom interview",
    customRequest && !/^skip$/i.test(customRequest)
      ? `**Custom ask (interview):** ${customRequest.slice(0, 500)}`
      : null,
    details ? `**Feedback:** ${details.slice(0, 1500)}` : null,
    metrics
      ? `**Build:** ${metrics.buildSeconds}s · ${metrics.categoryCount} cat · ${metrics.channelCount} ch · ${metrics.roleCount} roles`
      : null
  ].filter(Boolean);

  logStaffUsage(client, {
    action: isProblem ? "📋 Post-build survey — needs attention" : "📋 Post-build survey",
    guild,
    user,
    color: isProblem ? 0xe74c3c : outcome === "great" ? 0x57f287 : 0x3498db,
    detail: lines.join("\n")
  });
}

export function logStaffBuildComplete(client, guild, metrics, ownerUser, blueprint) {
  const preset = blueprint?.lastPreset ? `preset \`${blueprint.lastPreset}\`` : "custom interview";
  const tickets = blueprint?.tickets?.enabled ? " · tickets on" : "";
  logStaffUsage(client, {
    action: "✅ Build finished",
    guild,
    user: ownerUser || null,
    color: 0x57f287,
    detail: [
      preset + tickets,
      `⏱️ ${metrics.buildSeconds}s · 📁 ${metrics.categoryCount} categories · 📄 ${metrics.channelCount} channels · 🧩 ${metrics.roleCount} roles`
    ].join("\n")
  });
}
