import fs from "fs";
import path from "path";

const TEMPLATE_PATH = path.resolve("templates", "earncord.json");

export const EARNCORD_PRESET_IDS = ["earncord"];

export const EARNCORD_TICKET_CATEGORIES = [
  {
    id: "account",
    label: "Account / Login",
    description: "Website signup, Discord OAuth, or linking issues",
    emoji: "🔑"
  },
  {
    id: "match",
    label: "Survey Match",
    description: "Matching, inventory, or quality-score questions",
    emoji: "📋"
  },
  {
    id: "payout",
    label: "Payouts / USDT",
    description: "Balance, withdrawals, or wallet questions",
    emoji: "💸"
  },
  {
    id: "bug",
    label: "Bug Report",
    description: "Something broken — include steps to reproduce",
    emoji: "🐛"
  },
  {
    id: "other",
    label: "Other",
    description: "Anything else",
    emoji: "💬"
  }
];

export function isEarnCordPreset(preset) {
  return EARNCORD_PRESET_IDS.includes(preset);
}

/**
 * Load the official EarnCord survey-server blueprint (no AI interview).
 * @param {import('discord.js').Guild} [_guild]
 */
export function loadEarnCordBlueprint(_guild) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error("templates/earncord.json not found");
  }

  const blueprint = JSON.parse(fs.readFileSync(TEMPLATE_PATH, "utf-8"));

  blueprint.tickets = {
    enabled: true,
    panelChannel: "create-ticket",
    categories: EARNCORD_TICKET_CATEGORIES,
    staffRoles: ["Support Agent", "Founder"]
  };

  // Keep channel names clean (no emoji│ prefix) so EarnCord bot + docs match.
  blueprint.style = blueprint.style || {};
  delete blueprint.style.emojiPrefix;

  for (const catName of Object.keys(blueprint.categories || {})) {
    const channels = blueprint.categories[catName];
    if (!Array.isArray(channels)) continue;

    blueprint.categories[catName] = channels.map((ch) => {
      const name = (ch.name || "").toLowerCase();
      const copy = { ...ch };

      if (name === "rules") {
        copy.pinMessage = true;
        copy.permissionsPreset = copy.permissionsPreset || "public-readonly";
      }
      if (name === "welcome" || name === "about" || name === "faq" || name === "start-here") {
        copy.permissionsPreset = copy.permissionsPreset || "public-readonly";
      }
      if (name === "create-ticket") {
        copy.permissionsPreset = copy.permissionsPreset || "public-readonly";
      }
      if (name === "announcements") {
        copy.permissionsPreset = copy.permissionsPreset || "announcement-lock";
      }

      return copy;
    });
  }

  return blueprint;
}

export const EARNCORD_BUILD_SUMMARY = [
  "⚡ **EarnCord survey preset** — fixed template (no interview):",
  "• Roles: Founder, Support Agent, tier roles (New → Gold), Member",
  "• WELCOME · EARN · COMMUNITY · SUPPORT · STAFF",
  "• #start-here → sign up at earncord/#login then run `/start`",
  "• Embeds: welcome, rules, about, FAQ, how-it-works, surveys",
  "• Tickets: Account/Login · Survey Match · Payouts/USDT · Bug · Other"
].join("\n");
