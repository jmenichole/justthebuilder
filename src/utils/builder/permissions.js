import { PermissionFlagsBits } from "discord.js";
import { log } from "../logger.js";

// Map human-readable strings to Discord permission flags.
const PERM_MAP = {
  Administrator: PermissionFlagsBits.Administrator,
  ManageMessages: PermissionFlagsBits.ManageMessages,
  EmbedLinks: PermissionFlagsBits.EmbedLinks,
  AttachFiles: PermissionFlagsBits.AttachFiles,
  TimeoutMembers: PermissionFlagsBits.ModerateMembers,
  ManageChannels: PermissionFlagsBits.ManageChannels,
  ViewChannel: PermissionFlagsBits.ViewChannel,
  SendMessages: PermissionFlagsBits.SendMessages,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  ManageThreads: PermissionFlagsBits.ManageThreads,
  CreatePublicThreads: PermissionFlagsBits.CreatePublicThreads,
  CreatePrivateThreads: PermissionFlagsBits.CreatePrivateThreads,
  ManageWebhooks: PermissionFlagsBits.ManageWebhooks
};

/**
 * Resolve array of string permissions to permission flag constants.
 * @param {string[]} permissionNames
 * @returns {bigint[]} Array of discord.js PermissionFlagsBits
 */
export function resolveRolePermissions(permissionNames = []) {
  return permissionNames
    .map(p => PERM_MAP[p])
    .filter(Boolean);
}

/**
 * Apply per-channel permission overwrites based on blueprint definition.
 * @param {import('discord.js').GuildChannel} channel
 * @param {Object} channelDef
 * @param {Object} roleMap
 */
export async function applyChannelPermissions(channel, channelDef, roleMap) {
  try {
    const overwrites = [];

    // @everyone base
    const everyoneId = channel.guild.roles.everyone.id;

    if (channelDef.private) {
      // Deny view for everyone unless explicitly allowed
      overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] });
    } else if (channelDef.readOnly) {
      overwrites.push({ id: everyoneId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
    }

    // Permission preset mapping
    const preset = channelDef.permissionsPreset || (typeof channelDef.permissions === 'string' ? channelDef.permissions : null);
    if (preset) {
      applyPreset(preset, overwrites, roleMap, channel.guild.roles.everyone.id);
    }

    // Allowed roles (for private channel) when not handled by preset
    if (channelDef.allowedRoles && channelDef.allowedRoles.length) {
      for (const roleName of channelDef.allowedRoles) {
        const roleId = roleMap[roleName];
        if (!roleId) continue;
        overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel] });
      }
    }

    // Moderator convenience permissions
    for (const [roleName, roleId] of Object.entries(roleMap)) {
      if (/mod|moderator/i.test(roleName)) {
        overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageThreads] });
      }
      if (/admin/i.test(roleName)) {
        overwrites.push({ id: roleId, allow: [PermissionFlagsBits.Administrator] });
      }
    }

    if (overwrites.length) {
      await channel.permissionOverwrites.set(overwrites);
    }
  } catch (err) {
    log(`Permission overwrite failed for channel ${channel.name}: ${err.message}`);
  }
}

/**
 * Mutate overwrites array according to a named permissions preset.
 * @param {string} name Preset identifier
 * @param {Array<Object>} overwrites Accumulated overwrites (mutated in place)
 * @param {Object} roleMap Role name -> role id map
 * @param {string} everyoneId Guild @everyone role id
 */
function applyPreset(name, overwrites, roleMap, everyoneId) {
  switch (name) {
    case 'public-readonly':
      overwrites.push({ id: everyoneId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
      break;
    case 'mods-only':
      overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] });
      for (const [roleName, roleId] of Object.entries(roleMap)) {
        if (/mod|moderator/i.test(roleName)) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      }
      break;
    case 'verified-only':
      overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] });
      for (const [roleName, roleId] of Object.entries(roleMap)) {
        if (/verified/i.test(roleName)) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      }
      break;
    case 'staff-private':
      overwrites.push({ id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] });
      for (const [roleName, roleId] of Object.entries(roleMap)) {
        if (/admin|mod|staff|moderator/i.test(roleName)) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
      }
      break;
    case 'announcement-lock':
      overwrites.push({ id: everyoneId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] });
      for (const [roleName, roleId] of Object.entries(roleMap)) {
        if (/admin|mod|moderator/i.test(roleName)) overwrites.push({ id: roleId, allow: [PermissionFlagsBits.SendMessages] });
      }
      break;
    default:
      break;
  }
}
