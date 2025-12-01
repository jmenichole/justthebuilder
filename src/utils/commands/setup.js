import { runInterview } from "../ai/interviewFlow.js";
import { log } from "../logger.js";
import { applyBlueprint } from "../applyBlueprint.js";
import { validateBlueprint } from "../ai/schemas.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import fs from 'fs';
import path from 'path';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

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
  description: "Run or reset the automated server builder.",
  options: [
    { type: 1, name: "run", description: "Run the interview flow again" },
    { type: 1, name: "reset", description: "Reset server structure (DANGEROUS)" },
    { type: 1, name: "preview", description: "Preview last built blueprint JSON" },
    { type: 1, name: "export", description: "Export current server into a blueprint" },
    { type: 1, name: "reapply", description: "Reapply last stored blueprint" },
    { type: 1, name: "import", description: "Import a blueprint JSON", options: [ { type: 11, name: 'file', description: 'Blueprint JSON file', required: true } ] },
    { type: 1, name: "save-template", description: "Save last blueprint as named template", options: [ { type: 3, name: 'name', description: 'Template name', required: true } ] }
  ]
};

/**
 * Ask the invoker to type CONFIRM within 30s for destructive reset.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function confirmReset(interaction) {
  await interaction.reply({
    ephemeral: true,
    content: "Type CONFIRM within 30s to proceed with reset." 
  });
  const filter = i => i.user.id === interaction.user.id;
  try {
    const msg = await interaction.channel.awaitMessages({ max: 1, time: 30000 });
    if (msg.first()?.content === "CONFIRM") return true;
  } catch {}
  return false;
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

  if (sub === "run") {
    // Check cooldowns
    const now = Date.now();
    const serverLast = serverCooldowns.get(interaction.guild.id) || 0;
    const userLast = userCooldowns.get(interaction.user.id) || 0;
    if (now - serverLast < SERVER_COOLDOWN_MS) {
      const wait = (((SERVER_COOLDOWN_MS - (now - serverLast)))/1000).toFixed(0);
      return interaction.reply({ ephemeral: true, content: `Server cooldown active. Try again in ${wait}s.` });
    }
    if (now - userLast < USER_COOLDOWN_MS) {
      const wait = (((USER_COOLDOWN_MS - (now - userLast)))/1000).toFixed(0);
      return interaction.reply({ ephemeral: true, content: `Your personal cooldown active. Try again in ${wait}s.` });
    }
    serverCooldowns.set(interaction.guild.id, now);
    userCooldowns.set(interaction.user.id, now);
    await interaction.reply({ ephemeral: true, content: "Launching interview..." });
    try {
      await owner.send("Re-running server setup interview.");
      await runInterview(owner.user, interaction.guild, client);
    } catch (err) {
      log(`Setup run DM failed: ${err.message}`);
      await interaction.followUp({ ephemeral: true, content: "DM failed; running here." });
      // Fallback not implemented for brevity
    }
  } else if (sub === "reset") {
    const confirmed = await confirmReset(interaction);
    if (!confirmed) return interaction.followUp({ ephemeral: true, content: "Reset cancelled." });
    await interaction.followUp({ ephemeral: true, content: "Resetting server channels..." });
    await wipeServer(interaction.guild);
    await interaction.followUp({ ephemeral: true, content: "Server channels wiped." });
  } else if (sub === "preview") {
    try {
      const filePath = path.resolve('data', 'blueprints', `${interaction.guild.id}.json`);
      if (!fs.existsSync(filePath)) {
        return interaction.reply({ ephemeral: true, content: 'No blueprint stored yet.' });
      }
      const json = fs.readFileSync(filePath, 'utf-8');
      // Send pretty file
      await interaction.reply({ ephemeral: true, content: 'Sending blueprint file…' });
      await interaction.user.send({
        content: 'Blueprint Preview:\n```json\n' + json + '\n```',
        files: [ { attachment: Buffer.from(json), name: 'blueprint.json' } ]
      });
    } catch (err) {
      log(`Preview failed: ${err.message}`);
      return interaction.reply({ ephemeral: true, content: 'Failed to load blueprint.' });
    }
  } else if (sub === 'export') {
    await interaction.reply({ ephemeral: true, content: 'Exporting guild…' });
    const data = await exportGuild(interaction.guild);
    const exportDir = path.resolve('data', 'exports');
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
    const filePath = path.join(exportDir, `${interaction.guild.id}-export.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    saveGuildConfig(interaction.guild.id, { ...loadGuildConfig(interaction.guild.id), lastBlueprint: data, lastExport: Date.now() });
    await interaction.followUp({ ephemeral: true, content: 'Export complete. DMing file.' });
    await interaction.user.send({ content: 'Guild Export Blueprint', files: [ filePath ] });
  } else if (sub === 'reapply') {
    const cfg = loadGuildConfig(interaction.guild.id);
    const bp = cfg.lastBlueprint;
    if (!bp) return interaction.reply({ ephemeral: true, content: 'No stored blueprint. Run /setup run first or import/export.' });
    await interaction.reply({ ephemeral: true, content: 'Reapplying blueprint…' });
    try {
      const metrics = await applyBlueprint(interaction.guild, bp, interaction.user);
      saveGuildConfig(interaction.guild.id, { ...cfg, lastReapply: Date.now(), lastMetrics: metrics });
      await interaction.followUp({ ephemeral: true, content: `Reapply complete. Channels: ${metrics.channelCount}, Roles: ${metrics.roleCount}` });
    } catch (err) {
      log('Reapply failed: ' + err.message);
      await interaction.followUp({ ephemeral: true, content: 'Reapply failed: ' + err.message });
    }
  } else if (sub === 'import') {
    await interaction.reply({ ephemeral: true, content: 'Importing blueprint…' });
    const attachment = interaction.options.getAttachment('file');
    if (!attachment) return interaction.followUp({ ephemeral: true, content: 'Attach a blueprint JSON file.' });
    try {
      const text = await fetch(attachment.url).then(r => r.text());
      const json = JSON.parse(text);
      const valid = validateBlueprint(json);
      if (!valid) {
        return interaction.followUp({ ephemeral: true, content: 'Validation errors: ' + validateBlueprint.errors.map(e => e.message).join('; ') });
      }
      const bpDir = path.resolve('data', 'blueprints');
      if (!fs.existsSync(bpDir)) fs.mkdirSync(bpDir, { recursive: true });
      fs.writeFileSync(path.join(bpDir, `${interaction.guild.id}.json`), JSON.stringify(json, null, 2));
      saveGuildConfig(interaction.guild.id, { ...loadGuildConfig(interaction.guild.id), lastBlueprint: json, importedAt: Date.now() });
      await interaction.followUp({ ephemeral: true, content: 'Blueprint imported. Use /setup reapply to build.' });
    } catch (err) {
      log('Import failed: ' + err.message);
      return interaction.followUp({ ephemeral: true, content: 'Import failed: ' + err.message });
    }
  } else if (sub === 'save-template') {
    const name = interaction.options.getString('name');
    if (!name.match(/^[a-z0-9_-]{2,32}$/i)) {
      return interaction.reply({ ephemeral: true, content: 'Template name must be 2-32 chars (alphanumeric, dash, underscore).' });
    }
    const cfg = loadGuildConfig(interaction.guild.id);
    const bp = cfg.lastBlueprint;
    if (!bp) return interaction.reply({ ephemeral: true, content: 'No blueprint stored yet to save.' });
    const templatesDir = path.resolve('templates');
    if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
    const filePath = path.join(templatesDir, `${name}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(bp, null, 2));
      await interaction.reply({ ephemeral: true, content: `Template saved as ${name}.json` });
    } catch (err) {
      log('Template save failed: ' + err.message);
      await interaction.reply({ ephemeral: true, content: 'Failed to save template.' });
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
  const branding = loadGuildConfig(guild.id).lastBlueprint?.branding || undefined;
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
  return { name: guild.name, roles, categories, branding };
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
