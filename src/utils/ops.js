/**
 * Bot ops logging — posts to shared bot-test channels.
 * Fire-and-forget: never throw into slash handlers.
 */
import { EmbedBuilder } from "discord.js";
import { log } from "./logger.js";

const COLORS = {
  error: 0xe74c3c,
  analytics: 0x3498db,
  support: 0x9b59b6,
  purchase: 0xf1c40f,
  install: 0x2ecc71,
};

let _client = null;
let _config = null;

function opsFromEnv() {
  return {
    botId: process.env.ALERTS_BOT_ID || "justthebuilder",
    guildId: (process.env.OPS_GUILD_ID || "").trim(),
    errorChannelId: (process.env.OPS_ERROR_CHANNEL_ID || "").trim(),
    analyticsChannelId: (process.env.OPS_ANALYTICS_CHANNEL_ID || "").trim(),
    supportChannelId: (process.env.OPS_SUPPORT_CHANNEL_ID || "").trim(),
    alertUserId: (process.env.OPS_ALERT_USER_ID || "1153034319271559328").trim(),
  };
}

export function initOps(client, config = {}) {
  _client = client;
  _config = { ...opsFromEnv(), ...config };
  const ops = _config;
  if (!ops.errorChannelId && !ops.analyticsChannelId && !ops.supportChannelId) {
    log("[ops] No OPS_*_CHANNEL_ID set — channel logging disabled");
    return;
  }
  log(
    `[ops] ${ops.botId} | guild ${ops.guildId || "(any)"} | ` +
      `errors=${ops.errorChannelId || "off"} ` +
      `analytics=${ops.analyticsChannelId || "off"} ` +
      `support=${ops.supportChannelId || "off"}`
  );
}

function truncate(text, max = 500) {
  const s = String(text ?? "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function botId() {
  return _config?.botId || "justthebuilder";
}

async function sendToChannel(channelId, payload) {
  if (!_client || !channelId) return;
  try {
    const channel = await _client.channels.fetch(channelId);
    if (!channel?.isTextBased?.()) return;
    await channel.send(payload);
  } catch (err) {
    log(`[ops] Failed to post to ${channelId}: ${err.message}`);
  }
}

function postOps(kind, build) {
  const ops = _config || {};
  const channelId =
    kind === "error"
      ? ops.errorChannelId
      : kind === "support"
        ? ops.supportChannelId
        : ops.analyticsChannelId;
  if (!channelId) return;
  Promise.resolve()
    .then(() => build())
    .then((payload) => sendToChannel(channelId, payload))
    .catch((err) => log(`[ops] ${kind} dropped: ${err.message}`));
}

function criticalMention() {
  const userId = _config?.alertUserId;
  return userId ? `<@${userId}>` : "";
}

/**
 * @param {{ context: string, message: string, stack?: string, critical?: boolean }} opts
 * Mentions the ops alert user only when `critical: true` (process crashes, etc.).
 * Routine interaction failures stay quiet so staff aren't pinged on every miss-click.
 */
export function postError({ context, message, stack, critical = false }) {
  postOps("error", () => {
    const mention = critical ? criticalMention() : "";
    const embed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setTitle(critical ? "🔴 Critical bot error" : "⚠️ Bot error")
      .setDescription(`**${truncate(context, 100)}**\n\`\`\`\n${truncate(message, 800)}\n\`\`\``)
      .setFooter({ text: botId() })
      .setTimestamp();
    if (stack) {
      embed.addFields({ name: "Stack", value: `\`\`\`\n${truncate(stack, 900)}\n\`\`\`` });
    }
    return {
      content: mention ? `${mention} **critical alert**` : undefined,
      allowedMentions: mention ? { users: [_config.alertUserId] } : { parse: [] },
      embeds: [embed],
    };
  });
}

export function postAnalytics({ event, title, description, fields = [], color }) {
  postOps("analytics", () => ({
    embeds: [
      new EmbedBuilder()
        .setColor(color ?? COLORS.analytics)
        .setTitle(title || event)
        .setDescription(description || null)
        .addFields(fields.filter(Boolean).slice(0, 10))
        .setFooter({ text: `${botId()} · ${event}` })
        .setTimestamp(),
    ],
  }));
}

export function postSupport({ type, user, guild, details }) {
  postOps("support", () => ({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.support)
        .setTitle(type || "Support")
        .setDescription(details ? truncate(details, 1500) : "_No details_")
        .addFields(
          { name: "User", value: `${user?.tag || "?"} (<@${user?.id}>)`, inline: true },
          { name: "Guild", value: guild ? `${guild.name}\n\`${guild.id}\`` : "DM / unknown", inline: true }
        )
        .setFooter({ text: `${botId()} · support` })
        .setTimestamp(),
    ],
  }));
}

export function postGuildInstall(guild) {
  postAnalytics({
    event: "guild_install",
    title: "🟢 Bot added to server",
    description: `**${guild.name}**`,
    color: COLORS.install,
    fields: [
      { name: "Guild ID", value: `\`${guild.id}\``, inline: true },
      { name: "Members", value: String(guild.memberCount ?? "?"), inline: true },
    ],
  });
}

export function postSurpriseGrant(guild, { installNumber, grantsAwarded }) {
  postAnalytics({
    event: "surprise_grant",
    title: "🎁 Surprise free unlock",
    description: `**${guild.name}** won the install lottery`,
    color: COLORS.purchase,
    fields: [
      { name: "Guild ID", value: `\`${guild.id}\``, inline: true },
      { name: "Install #", value: String(installNumber ?? "?"), inline: true },
      { name: "Total grants", value: String(grantsAwarded ?? "?"), inline: true }
    ]
  });
}

export function postPurchase({ userId, skuId, skuLabel }) {
  postAnalytics({
    event: "purchase",
    title: "💰 Purchase",
    description: `<@${userId}> bought **${skuLabel || skuId}**`,
    color: COLORS.purchase,
    fields: [
      { name: "SKU", value: `\`${skuId}\``, inline: true },
      { name: "User ID", value: `\`${userId}\``, inline: true },
    ],
  });
}
