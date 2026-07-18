import { EmbedBuilder } from "discord.js";

const HEADER_EMOJIS = {
  rules: "📜",
  faq: "❓",
  about: "🧩",
  welcome: "👋",
  default: "💬"
};

const DESC_SOFT_MAX = 900;

/**
 * Build a stylized embed for server info sections.
 * @param {Object} message - Message blueprint object.
 * @param {Object} style - Style config from blueprint.
 * @param {Object} [branding]
 */
export function buildStyledEmbed(message, style, branding) {
  const baseColor = style?.theme === "neon-gold" ? 0xffd700 : 0x23272a;
  const brandingColor = branding?.color ? parseHexColor(branding.color) : null;
  const embed = new EmbedBuilder().setColor(brandingColor ?? baseColor);

  if (message.title) {
    const key = String(message.title)
      .toLowerCase()
      .replace(/[^a-z]/g, "");
    const emoji =
      branding?.emoji ||
      HEADER_EMOJIS[key.includes("rule") ? "rules" : key.includes("faq") ? "faq" : key.includes("about") ? "about" : key.includes("welcome") ? "welcome" : "default"] ||
      HEADER_EMOJIS.default;
    const titleHasEmoji = /^\p{Extended_Pictographic}/u.test(message.title.trim());
    embed.setTitle(titleHasEmoji ? message.title : `${emoji} ${message.title}`);
  }

  const { description, fields: autoFields } = formatEmbedBody(message.body || "");
  if (description) embed.setDescription(description);

  if (Array.isArray(message.sections)) {
    for (const section of message.sections) {
      embed.addFields({
        name: formatSectionHeader(section.header),
        value: buildSectionValue(section),
        inline: Boolean(section.inline)
      });
    }
  }

  for (const field of autoFields) {
    embed.addFields(field);
  }

  if (message.footer) {
    embed.setFooter({ text: String(message.footer).slice(0, 2048) });
  }

  return embed;
}

/**
 * Turn a dense one-paragraph body into spaced description + link/support fields.
 * @param {string} body
 * @returns {{ description: string, fields: { name: string, value: string, inline?: boolean }[] }}
 */
export function formatEmbedBody(body) {
  const raw = String(body || "").trim();
  if (!raw) return { description: "", fields: [] };

  const urls = [...raw.matchAll(/https?:\/\/[^\s)>\]"'`,]+/gi)].map((m) => m[0].replace(/[.,;:]+$/, ""));
  const uniqueUrls = [...new Set(urls)];
  const emails = [...raw.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)].map((m) => m[0]);
  const uniqueEmails = [...new Set(emails)];

  let text = raw;
  for (const url of uniqueUrls) {
    text = text.split(url).join("");
  }
  for (const email of uniqueEmails) {
    text = text.split(email).join("");
  }

  text = text
    .replace(/\s*(?:privacy policy|terms(?: of service)?|contact(?: our support team)?)\s*(?:at|:)?\s*/gi, " ")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[^\S\n]+([,.])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let description = densifyToParagraphs(text);
  if (description.length > DESC_SOFT_MAX) {
    description = `${description.slice(0, DESC_SOFT_MAX - 1).trim()}…`;
  }

  const fields = [];
  if (uniqueUrls.length) {
    fields.push({
      name: "🔗 Links",
      value: uniqueUrls.map((u) => `• ${u}`).join("\n").slice(0, 1024),
      inline: false
    });
  }
  if (uniqueEmails.length) {
    fields.push({
      name: "📬 Support",
      value: uniqueEmails.map((e) => `• ${e}`).join("\n").slice(0, 1024),
      inline: false
    });
  }

  return { description, fields };
}

/** @param {string} text */
function densifyToParagraphs(text) {
  if (!text) return "";
  if (/\n\n/.test(text)) {
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }

  // Split long single-line copy on sentence boundaries into short paragraphs.
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z#])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return wrapLongLine(text, 90);
  }

  const chunks = [];
  let buf = "";
  for (const sentence of sentences) {
    if (!buf) {
      buf = sentence;
      continue;
    }
    if ((buf + " " + sentence).length > 160) {
      chunks.push(buf);
      buf = sentence;
    } else {
      buf = `${buf} ${sentence}`;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.join("\n\n");
}

function wrapLongLine(text, width) {
  if (text.length <= width || text.includes("\n")) return text;
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if ((line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function parseHexColor(hex) {
  const cleaned = String(hex).replace("#", "");
  return parseInt(cleaned, 16);
}

function formatSectionHeader(header) {
  if (!header) return "\u200b";
  return String(header);
}

function buildSectionValue(section) {
  let value = section.content || "";
  if (section.bullets && section.bullets.length) {
    const bullets = section.bullets.map((b) => `• ${b}`).join("\n");
    value = value ? `${value}\n${bullets}` : bullets;
  }
  return (value || "\u200b").slice(0, 1024);
}
