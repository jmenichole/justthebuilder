import { loadGuildConfig, saveGuildConfig } from "./storage/guildConfig.js";
import { postAnalytics } from "./ops.js";
import { log } from "./logger.js";
import fs from "fs";
import path from "path";

export const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;
export const STRUCTURE_STEPS = new Set(["structure_applied", "polish_applied"]);

export function staleMs() {
  const raw = process.env.FUNNEL_STALE_MS;
  if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) return Number(raw);
  return DEFAULT_STALE_MS;
}

export function hasReachedStructure(cfg = {}) {
  if (cfg.structureAppliedAt || cfg.polishAppliedAt) return true;
  const step = cfg.funnel?.lastStep;
  return STRUCTURE_STEPS.has(step);
}

export function hoursSinceInstall(funnel) {
  if (!funnel?.installedAt) return null;
  const t = Date.parse(funnel.installedAt);
  if (!Number.isFinite(t)) return null;
  return ((Date.now() - t) / 3600000).toFixed(1);
}

/**
 * Fire-and-forget funnel step. Never throws to callers.
 * @param {import('discord.js').Guild|null} guild
 * @param {string} step
 * @param {{ owner?: import('discord.js').User, fields?: object[], title?: string, description?: string, color?: number }} [extra]
 */
export function recordFunnelStep(guild, step, extra = {}) {
  try {
    const guildId = guild?.id || extra.guildId;
    if (!guildId || !step) return;

    const cfg = loadGuildConfig(guildId);
    const now = new Date().toISOString();
    const funnel = { ...(cfg.funnel || {}) };
    if (step === "guild_install" && !funnel.installedAt) {
      funnel.installedAt = now;
    }
    if (!funnel.installedAt && guild) {
      // backfill if somehow missing
      funnel.installedAt = funnel.installedAt || now;
    }
    funnel.lastStep = step;
    funnel.lastStepAt = now;
    saveGuildConfig(guildId, { ...cfg, funnel });

    const hrs = hoursSinceInstall(funnel);
    const fields = [
      guild ? { name: "Guild", value: `${guild.name}\n\`${guild.id}\``, inline: true } : { name: "Guild", value: `\`${guildId}\``, inline: true },
      extra.owner
        ? { name: "Owner", value: `${extra.owner.tag || extra.owner.username} (<@${extra.owner.id}>)`, inline: true }
        : null,
      { name: "Step", value: `\`${step}\``, inline: true },
      hrs != null ? { name: "Hours since install", value: String(hrs), inline: true } : null,
      ...(extra.fields || []),
    ];

    postAnalytics({
      event: step,
      title: extra.title || `📊 Funnel · ${step}`,
      description: extra.description || null,
      color: extra.color,
      fields,
    });
  } catch (err) {
    log(`[funnel] recordFunnelStep failed: ${err.message}`);
  }
}

export function scanStaleFunnels(client) {
  try {
    const dir = path.resolve("data", "guilds");
    if (!fs.existsSync(dir)) return;
    const threshold = staleMs();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const guildId = file.replace(/\.json$/, "");
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      const cfg = loadGuildConfig(guildId);
      const funnel = cfg.funnel || {};
      if (!funnel.installedAt || funnel.staleAlerted) continue;
      if (hasReachedStructure(cfg)) continue;
      const installed = Date.parse(funnel.installedAt);
      if (!Number.isFinite(installed)) continue;
      if (Date.now() - installed < threshold) continue;

      postAnalytics({
        event: "stale_install",
        title: "⏰ Stale install — no structure in 24h",
        description: `**${guild.name}** never reached free structure.`,
        color: 0xe67e22,
        fields: [
          { name: "Guild", value: `\`${guild.id}\``, inline: true },
          { name: "Last step", value: `\`${funnel.lastStep || "none"}\``, inline: true },
          { name: "Installed", value: funnel.installedAt, inline: false },
        ],
      });
      saveGuildConfig(guildId, {
        ...cfg,
        funnel: { ...funnel, staleAlerted: true },
      });
    }
  } catch (err) {
    log(`[funnel] scanStaleFunnels failed: ${err.message}`);
  }
}

export function startFunnelScanner(client) {
  const hour = 60 * 60 * 1000;
  setTimeout(() => scanStaleFunnels(client), 60_000);
  setInterval(() => scanStaleFunnels(client), hour);
  log("[funnel] stale scanner scheduled (1h interval, first run ~60s)");
}
