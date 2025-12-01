import { ChannelType, PermissionFlagsBits } from "discord.js";
import { applyChannelPermissions } from "./permissions.js";
import { log } from "../logger.js";
import { sendProgress } from "../progress.js";

/**
 * Format a channel name into lowercase-dash style with optional emoji prefix.
 * Avoids duplicate emoji prefix if already present.
 * @param {string} rawName Original name from blueprint
 * @param {Object} style Style object (provides emojiPrefix)
 * @param {Object} [branding] Branding object (may override emoji prefix)
 * @returns {string} Formatted channel name
 */
function formatChannelName(rawName, style, branding) {
  if (!rawName) return rawName;
  const base = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const emojiPrefix = branding?.emoji || style?.emojiPrefix || "";
  let name = base;
  if (emojiPrefix) {
    // Avoid duplicate prefix
    const cleaned = name.replace(new RegExp(`^${emojiPrefix}`), "");
    name = `${emojiPrefix}│${cleaned}`;
  }
  return name;
}

/**
 * Resolve blueprint channel type string to discord.js ChannelType.
 * @param {Object} def
 */
function resolveChannelType(def) {
  switch (def.type) {
    case "voice": return ChannelType.GuildVoice;
    case "announcement": return ChannelType.GuildAnnouncement;
    case "media": return ChannelType.GuildText; // could become dedicated type later
    case "stage": return ChannelType.GuildStageVoice;
    case "forum": return ChannelType.GuildForum;
    case "text":
    default: return ChannelType.GuildText;
  }
}

/**
 * Create categories & channels based on full blueprint (for access to style & private).
 */
/**
 * Create categories & channels based on blueprint.
 * @param {import('discord.js').Guild} guild
 * @param {Object} blueprint
 * @param {Object} roleMap
 * @param {import('discord.js').User} [progressUser]
 */
export async function createChannels(guild, blueprint, roleMap, progressUser) {
  const { categories, style, branding } = blueprint;
  const channelMap = {};
  const categoryPrivacy = blueprint.categoryPrivacy || {};
  const orderingBuckets = {}; // categoryName -> [{channel, order}]

  for (const categoryName of Object.keys(categories)) {
    try {
      const formattedCategoryName = formatChannelName(categoryName, { emojiPrefix: "" }, null); // keep category clean (no branding for categories)
      const category = await guild.channels.create({
        name: formattedCategoryName,
        type: ChannelType.GuildCategory
      });

      // Category privacy preset (inherits to channels unless overridden)
      const catPreset = categoryPrivacy[categoryName];
      if (catPreset) {
        try { await applyCategoryPreset(category, catPreset, roleMap); } catch (err) { log(`Category preset failed (${categoryName}): ${err.message}`); }
      }

      for (const chDef of categories[categoryName]) {
        const originalName = chDef.name || chDef;
        const channelName = formatChannelName(originalName, style, branding);
        try {
          const createOpts = {
            name: channelName,
            type: resolveChannelType(chDef),
            parent: category.id,
            topic: chDef.topic || undefined
          };
          if (createOpts.type === ChannelType.GuildForum && chDef.defaultAutoArchiveDuration) {
            createOpts.defaultAutoArchiveDuration = chDef.defaultAutoArchiveDuration;
          }
          const channel = await guild.channels.create(createOpts);
          channelMap[originalName] = channel.id;
          await applyChannelPermissions(channel, chDef, roleMap);

          // Thread lock - remove thread creation for everyone
          if (chDef.threadsLocked) {
            const everyoneId = guild.roles.everyone.id;
            await channel.permissionOverwrites.edit(everyoneId, {
              CreatePublicThreads: false,
              CreatePrivateThreads: false,
              SendMessagesInThreads: false
            }).catch(()=>{});
          }

          if (progressUser) await sendProgress(progressUser, `✅ Created ${channelName}`);

          // Ordering bucket
          if (typeof chDef.order === 'number') {
            if (!orderingBuckets[categoryName]) orderingBuckets[categoryName] = [];
            orderingBuckets[categoryName].push({ channel, order: chDef.order });
          }

          // Webhooks
          if (blueprint.webhooks && blueprint.webhooks[originalName]) {
            const whDef = blueprint.webhooks[originalName];
            try {
              await channel.createWebhook({ name: whDef.name || originalName, avatar: whDef.avatar || undefined });
              if (progressUser) await sendProgress(progressUser, `🔗 Webhook created for ${channelName}`);
            } catch (err) {
              log(`Webhook create failed (${channelName}): ${err.message}`);
            }
          }
        } catch (err) {
          log(`Channel create failed (${channelName}): ${err.message}`);
        }
      }
    } catch (err) {
      log(`Category create failed (${categoryName}): ${err.message}`);
    }
  }

  // Apply ordering
  for (const [catName, items] of Object.entries(orderingBuckets)) {
    items.sort((a,b)=>a.order - b.order);
    for (let i=0;i<items.length;i++) {
      const channel = items[i].channel;
      try { await channel.setPosition(i); } catch {}
    }
  }

  return { channelMap };
}

/**
 * Apply a category-level privacy preset by setting overwrites.
 * @param {import('discord.js').CategoryChannel} category
 * @param {string} preset Preset name (staff-private, mods-only, public-readonly)
 * @param {Object} roleMap Map of role name -> role id
 */
async function applyCategoryPreset(category, preset, roleMap) {
  const overwrites = [];
  const everyoneId = category.guild.roles.everyone.id;
  switch (preset) {
    case 'staff-private':
      overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] });
      for (const [roleName, roleId] of Object.entries(roleMap)) {
        if (/admin|mod|staff|moderator/i.test(roleName)) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
      }
      break;
    case 'mods-only':
      overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] });
      for (const [roleName, roleId] of Object.entries(roleMap)) {
        if (/mod|moderator/i.test(roleName)) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
      }
      break;
    case 'public-readonly':
      overwrites.push({ id: everyoneId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
      break;
    default:
      return;
  }
  if (overwrites.length) await category.permissionOverwrites.set(overwrites);
}

