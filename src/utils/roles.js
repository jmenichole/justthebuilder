import { resolveRolePermissions } from "./builder/permissions.js";
import { log } from "./logger.js";

/**
 * Create roles defined in blueprint, auto-inferring basic moderator/admin presets if permissions absent.
 * @param {import('discord.js').Guild} guild Discord guild instance
 * @param {{name:string,color?:string,permissions?:string[]}[]} roles Array of role definitions
 * @returns {Promise<Object>} Map of role name -> role id
 */
export async function createRoles(guild, roles) {
  const roleMap = {};
  for (const role of roles) {
    try {
      // Auto preset detection
      let permNames = role.permissions || [];
      const lower = role.name.toLowerCase();
      if (!permNames.length) {
        if (lower === 'admin') permNames = ['Administrator'];
        else if (lower === 'moderator' || lower === 'mod') permNames = ['ManageMessages','EmbedLinks','AttachFiles','TimeoutMembers','ManageThreads'];
      }
      const permissions = resolveRolePermissions(permNames);
      const createOpts = {
        name: role.name,
        permissions
      };
      if (role.color) createOpts.color = role.color;
      const newRole = await guild.roles.create(createOpts);
      roleMap[role.name] = newRole.id;
    } catch (err) {
      log(`Role create failed (${role.name}): ${err.message}`);
    }
  }
  return roleMap;
}
