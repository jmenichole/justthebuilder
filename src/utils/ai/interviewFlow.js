import { askAI } from "./gateway.js";
import { validateBlueprint, buildRepairPrompt, formatValidationErrors } from "./schemas.js";
import { applyBlueprint } from "../applyBlueprint.js";
import { log } from "../logger.js";
import { sendProgress } from "../progress.js";
import { inferRuleTemplate, inferFaqTemplate } from "./ruleTemplates.js";

/**
 * Attempt to extract a JSON object from an arbitrary AI string response.
 * Performs lightweight healing: remove fences, trailing commas, quote bare keys.
 * Returns parsed object or null if irreparable.
 * @param {string} raw Raw AI response text
 * @returns {Object|null}
 */
function selfHealJSON(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  // Strip code fences & language hints
  cleaned = cleaned.replace(/```(json)?/gi, "");
  // Remove leading explanation lines before first {
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  // Remove trailing text after final }
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace === -1) return null;
  cleaned = cleaned.slice(0, lastBrace + 1);
  // Common repairs: unquoted keys (simple heuristic), trailing commas
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  // Attempt parse
  try { return JSON.parse(cleaned); } catch {}
  // Heuristic: quote bare keys (simple regex, may over-match)
  cleaned = cleaned.replace(/([,{\n\r\t ]+)([A-Za-z0-9_]+):/g, (m, pre, key) => `${pre}"${key}":`);
  try { return JSON.parse(cleaned); } catch {}
  return null;
}

const FEW_SHOT_VALID = [
  {
    style: { emojiPrefix: "💸", theme: "neon-gold" },
    roles: [
      { name: "Admin", permissions: ["Administrator"], color: "#FFD700" },
      { name: "Moderator", permissions: ["ManageMessages","EmbedLinks"], color: "#DAA520" },
      { name: "Member", color: "#5865F2" }
    ],
    categories: {
      "SERVER INFO": [
        { name: "welcome", type: "text", message: { title: "Welcome", body: "Welcome to the server!" } },
        { name: "rules", type: "text", permissionsPreset: "public-readonly", message: { title: "Rules", body: "1. Be kind\n2. No spam" } }
      ],
      COMMUNITY: [ { name: "chat", type: "text" }, { name: "clips", type: "media" } ]
    }
  },
  {
    style: { theme: "streamer-dark", emojiPrefix: "🎥" },
    roles: [
      { name: "Admin", permissions: ["Administrator"], color: "#E91E63" },
      { name: "Mod", permissions: ["ManageMessages"], color: "#9C27B0" },
      { name: "Subscriber" }
    ],
    categories: {
      "INFO": [ { name: "welcome", type: "text" } ],
      "LIVE": [ { name: "live-chat", type: "text" }, { name: "voice-lounge", type: "voice" } ]
    }
  },
  {
    style: { theme: "minimal-clean" },
    roles: [ { name: "Admin", permissions: ["Administrator"] }, { name: "Moderator", permissions: ["ManageMessages"] }, { name: "Verified" } ],
    categories: {
      "SERVER INFO": [ { name: "welcome", type: "text" } ],
      COMMUNITY: [ { name: "chat", type: "text" }, { name: "forum-topics", type: "forum", defaultAutoArchiveDuration: 1440 } ]
    }
  }
];

// An invalid example and its corrected form to guide AI repair reasoning
const INVALID_AND_CORRECTED = {
  invalid: '{ roles: [ { name: Admin } ], categories: { INFO: [ "welcome" ] } }',
  corrected: {
    roles: [ { name: "Admin", permissions: ["Administrator"] } ],
    categories: { INFO: [ { name: "welcome", type: "text" } ] }
  }
};

/**
 * Issue AI request to convert interview answers into a blueprint object.
 * Applies few-shot examples and invalid/corrected pair for guidance.
 * @param {string[]} answers Collected interview answers
 * @param {import('discord.js').User} user User (for potential future personalization)
 * @returns {Promise<Object|null>} Parsed blueprint or null on failure
 */
async function generateBlueprint(answers, user) {
  const messages = [
    {
      role: "system",
      content: [
        "You convert interview answers into a STRICT JSON blueprint.",
        "Return ONLY JSON (no prose, no backticks).",
        "If unsure, make conservative choices."
      ].join(" \n")
    },
    {
      role: "system",
      content:
        "Valid examples:\n" + FEW_SHOT_VALID.map(j => JSON.stringify(j)).join("\n\n") +
        "\n\nInvalid example (do NOT emulate):\n" + INVALID_AND_CORRECTED.invalid +
        "\n\nCorrected form:\n" + JSON.stringify(INVALID_AND_CORRECTED.corrected)
    },
    { role: "user", content: answers.join("\n") }
  ];

  const raw = await askAI(messages);
  let parsed = selfHealJSON(raw);
  if (!parsed) {
    log("AI JSON parse failed initial attempt.");
  }
  return parsed;
}

/**
 * Conduct interactive DM interview, generate and validate blueprint, and build server.
 * @param {import('discord.js').User} user
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Client} client
 */
const SUGGESTION_PACKS = {
  serverType: [
    "Gaming community",
    "Crypto/NFT project",
    "Content creator fan server",
    "Study/education group",
    "Business/professional network",
    "Support/help desk"
  ],
  styles: [
    "neon-gold (vibrant, energetic)",
    "minimal-clean (simple, professional)",
    "dark-cyberpunk (edgy, tech)",
    "pastel-cozy (warm, friendly)",
    "streamer-purple (gaming, content)"
  ],
  categories: [
    "SERVER INFO, COMMUNITY, GENERAL",
    "WELCOME, RULES, CHAT, VOICE",
    "INFO, SUPPORT, HELP, GENERAL",
    "ANNOUNCEMENTS, DISCUSSION, MEDIA",
    "STAFF, PUBLIC, COMMUNITY"
  ],
  roles: [
    "Admin, Moderator, Member",
    "Owner, Admin, Mod, VIP, Verified",
    "Admin, Support, Premium, Member",
    "Founder, Staff, Community Manager"
  ],
  privateAreas: [
    "staff-chat, mod-logs",
    "admin-only, team-planning",
    "staff, moderator-chat, private-logs",
    "management, internal"
  ],
  ruleTemplates: [
    "Auto-detect from server type",
    "Gaming community rules",
    "Crypto/DeFi guidelines",
    "Support server rules",
    "Content creator rules",
    "Professional/business rules"
  ]
};

export async function runInterview(user, guild, client) {
  const questions = [
    { text: "What is this server about?", suggestions: SUGGESTION_PACKS.serverType },
    { text: "Describe the vibe/style you want.", suggestions: SUGGESTION_PACKS.styles },
    { text: "List categories you want (comma-separated).", suggestions: SUGGESTION_PACKS.categories },
    { text: "Do you want auto-written rules/about/FAQ? (yes/no)", suggestions: null },
    { text: "List roles with any special permissions.", suggestions: SUGGESTION_PACKS.roles },
    { text: "List any private/staff channels or role-restricted areas.", suggestions: SUGGESTION_PACKS.privateAreas },
    { text: "Do you want community / welcome screen enabled? (yes/no)", suggestions: null }
  ];

  const answers = [];
  const dm = await user.createDM();
  let selectedRuleTemplate = null;
  async function ask(questionObj) {
    const { text, suggestions } = questionObj;
    let msg = `📋 **${text}**`;
    if (suggestions && suggestions.length) {
      msg += "\n\n💡 **Suggestions:**";
      suggestions.forEach((s, i) => {
        msg += `\n  ${i + 1}. ${s}`;
      });
      msg += "\n\n_Type your answer or pick a number (1-" + suggestions.length + ")_";
    }
    await dm.send(msg);
    try {
      const collected = await dm.awaitMessages({
        filter: m => m.author.id === user.id,
        max: 1,
        time: 180000
      });
      let answer = collected.first()?.content?.trim() || "";
      // Parse numeric choice
      if (suggestions && /^\d+$/.test(answer)) {
        const idx = parseInt(answer, 10) - 1;
        if (idx >= 0 && idx < suggestions.length) {
          answer = suggestions[idx];
          await dm.send(`✅ Selected: **${answer}**`);
        }
      }
      log(`Interview answer for '${text.slice(0,30)}...': ${answer.slice(0,60)}`);
      return answer;
    } catch (err) {
      log(`Interview question timeout: ${text} - ${err?.message || 'no messages'}`);
      await dm.send("⏱️ Timeout. Leaving blank. You can rerun /setup run later to refine.");
      return "";
    }
  }
  for (let i = 0; i < questions.length; i++) {
    const a = await ask(questions[i]);
    answers.push(a);
    
    // After rules/FAQ question, ask for template preference if yes
    if (i === 3 && a.toLowerCase().includes('yes')) {
      const templateChoice = await ask({ 
        text: "Which rule template style do you prefer?", 
        suggestions: SUGGESTION_PACKS.ruleTemplates 
      });
      // Map template choice to template key
      if (templateChoice.toLowerCase().includes('gaming')) selectedRuleTemplate = 'gaming';
      else if (templateChoice.toLowerCase().includes('crypto') || templateChoice.toLowerCase().includes('defi')) selectedRuleTemplate = 'crypto';
      else if (templateChoice.toLowerCase().includes('support')) selectedRuleTemplate = 'support';
      else if (templateChoice.toLowerCase().includes('content')) selectedRuleTemplate = 'content';
      else if (templateChoice.toLowerCase().includes('professional') || templateChoice.toLowerCase().includes('business')) selectedRuleTemplate = 'professional';
      // Otherwise leave null for auto-detect
    }
  }

  await user.send("🧠 Generating blueprint with AI...");

  let blueprint = null;
  let validation = { valid: false, errors: [] };
  const MAX_TRIES = 3;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    if (attempt > 1) {
      await user.send(`🔁 Attempt ${attempt} fixing blueprint...`);
    }
    blueprint = await generateBlueprint(answers, user);
    if (!blueprint) {
      await user.send("⚠️ AI returned empty or invalid JSON. Retrying...");
      continue;
    }
    validation = validateBlueprint(blueprint);
    if (validation.valid) break;

    const repairPrompt = buildRepairPrompt(validation.errors);
    const repairRaw = await askAI([
      { role: "system", content: repairPrompt },
      { role: "user", content: JSON.stringify(blueprint) }
    ]);
    blueprint = selfHealJSON(repairRaw);
    validation = validateBlueprint(blueprint || {});
    if (validation.valid) break;
  }

  if (!validation.valid) {
    await user.send(
      "❌ Could not produce a valid blueprint after several attempts. Errors: " +
        formatValidationErrors(validation.errors)
    );
    return;
  }

  // Inject rules/about/FAQ if requested
  const wantsInfo = answers[3]?.toLowerCase().includes('yes');
  if (wantsInfo && blueprint.categories) {
    const firstCat = Object.keys(blueprint.categories)[0];
    if (firstCat) {
      const existing = blueprint.categories[firstCat] || [];
      const hasRules = existing.some(ch => ch.name?.toLowerCase().includes('rule'));
      const hasAbout = existing.some(ch => ch.name?.toLowerCase().includes('about'));
      const hasFaq = existing.some(ch => ch.name?.toLowerCase().includes('faq'));
      
      // Use selected template or auto-detect
      const { RULE_TEMPLATES, FAQ_TEMPLATES } = await import('./ruleTemplates.js');
      const ruleTemplate = selectedRuleTemplate ? RULE_TEMPLATES[selectedRuleTemplate] : inferRuleTemplate(answers[0]);
      const faqTemplate = selectedRuleTemplate ? FAQ_TEMPLATES[selectedRuleTemplate] : inferFaqTemplate(answers[0]);
      
      if (!hasRules) {
        const rulesBody = ruleTemplate.rules.map((r, i) => `${i + 1}. ${r}`).join('\n') + 
          '\n\n' + ruleTemplate.footer;
        existing.unshift({ 
          name: 'rules', 
          type: 'text', 
          permissionsPreset: 'public-readonly',
          message: { 
            title: ruleTemplate.title, 
            body: rulesBody
          } 
        });
      }
      if (!hasAbout) {
        existing.push({ 
          name: 'about', 
          type: 'text',
          message: { 
            title: '🧩 About This Server', 
            body: `Welcome to ${blueprint.name || guild.name}!\n\n${answers[0] || 'A community server.'}\n\nWe're building a vibrant community - join the conversation and have fun!` 
          } 
        });
      }
      if (!hasFaq) {
        const faqBody = faqTemplate.map(qa => `**Q: ${qa.q}**\nA: ${qa.a}`).join('\n\n');
        existing.push({ 
          name: 'faq', 
          type: 'text',
          message: { 
            title: '❓ Frequently Asked Questions', 
            body: faqBody
          } 
        });
      }
      blueprint.categories[firstCat] = existing;
      
      // Preview rules/FAQ
      await user.send('📋 **Generated Content Preview:**');
      if (!hasRules) {
        await user.send(`**${ruleTemplate.title}**\n${ruleTemplate.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n${ruleTemplate.footer}`);
      }
      if (!hasFaq) {
        await user.send(`**❓ FAQ Preview**\n${faqTemplate.map(qa => `Q: ${qa.q}\nA: ${qa.a}`).join('\n\n')}`);
      }
      
      // Ask for edits
      await user.send('\n✏️ Want to edit this content? Reply **edit** to customize, or **continue** to proceed.');
      try {
        const editChoice = await dm.awaitMessages({
          filter: m => m.author.id === user.id,
          max: 1,
          time: 60000
        });
        const choice = editChoice.first()?.content?.toLowerCase() || 'continue';
        if (choice.includes('edit')) {
          await user.send('💡 To customize: export the blueprint after build, edit the JSON, then use `/setup import` to rebuild with your changes.');
        }
      } catch {}
      
      await user.send('✅ Content looks good! Proceeding with build...');
    }
  }

  await user.send("✨ Blueprint validated. Building your server now...");
  try {
    await applyBlueprint(guild, blueprint, { ownerUser: user });
  } catch (err) {
    log(`Build failed: ${err.message}`);
    await user.send("❌ An error occurred while building the server. Check bot logs.");
  }
}

