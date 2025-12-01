import { log } from "../logger.js";
import { buildStyledEmbed } from "./embedFactory.js";

/**
 * Post any configured channel messages (rules/about/etc) as embeds.
 * @param {import('discord.js').Guild} guild
 * @param {Object} channelMap
 * @param {Object} blueprint
 */
export async function postMessages(guild, channelMap, blueprint) {
  for (const categoryName of Object.keys(blueprint.categories)) {
    for (const chDef of blueprint.categories[categoryName]) {
      if (!chDef.message) continue;
      try {
        const channelId = channelMap[chDef.name];
        if (!channelId) continue;
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId);
        const embed = buildStyledEmbed(chDef.message, blueprint.style, blueprint.branding);
        await channel.send({ embeds: [embed] });
      } catch (err) {
        log(`Failed to post message in ${chDef.name}: ${err.message}`);
      }
    }
  }
}

