import { EmbedBuilder } from "discord.js";

const HEADER_EMOJIS = {
  rules: "💡",
  faq: "📘",
  about: "🧩",
  welcome: "👋",
  default: "💬"
};

/**
 * Build a stylized embed for server info sections.
 * @param {Object} message - Message blueprint object.
 * @param {Object} style - Style config from blueprint.
 */
export function buildStyledEmbed(message, style, branding) {
  const baseColor = style?.theme === "neon-gold" ? 0xFFD700 : 0x23272A;
  const brandingColor = branding?.color ? parseHexColor(branding.color) : null;
  const embed = new EmbedBuilder().setColor(brandingColor ?? baseColor);

  if (message.title) {
    const key = message.title.toLowerCase();
    const emoji = branding?.emoji || HEADER_EMOJIS[key] || HEADER_EMOJIS.default;
    embed.setTitle(`${emoji} ${message.title}`);
  }
  if (message.body) embed.setDescription(formatBody(message.body));

  if (Array.isArray(message.sections)) {
    for (const section of message.sections) {
      embed.addFields({
        name: formatSectionHeader(section.header),
        value: buildSectionValue(section)
      });
    }
  }
  return embed;
}

function parseHexColor(hex) {
  const cleaned = hex.replace('#','');
  return parseInt(cleaned, 16);
}

function formatBody(body) {
  // Simple formatting enhancements: collapse multiple blank lines
  return body.replace(/\n{3,}/g, "\n\n");
}

function formatSectionHeader(header) {
  if (!header) return "\u200b";
  return `➤ ${header}`;
}

function buildSectionValue(section) {
  let value = section.content || "";
  if (section.bullets && section.bullets.length) {
    value += "\n" + section.bullets.map(b => `• ${b}`).join("\n");
  }
  return value || "\u200b";
}
