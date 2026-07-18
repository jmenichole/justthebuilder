import { askAI } from "./gateway.js";
import { validateBlueprint, buildRepairPrompt, formatValidationErrors } from "./schemas.js";
import { persistBlueprintOnly } from "../applyBlueprint.js";
import { log } from "../logger.js";
import {
  A,
  INTERVIEW_QUESTIONS,
  PRESET_ANSWERS,
  SUGGESTION_PACKS,
  buildInterviewBrief,
  mapRuleTemplateChoice,
  parseYes
} from "./interviewConfig.js";
import {
  applyBranding,
  applyExtras,
  applyInterviewMeta,
  applyTicketsToBlueprint,
  ensureVoiceAndAnnouncements,
  injectInfoEmbeds
} from "./interviewFinalize.js";
import {
  isSupportPreset,
  loadJustTheBuilderBlueprint,
  JUSTTHEBUILDER_BUILD_SUMMARY
} from "../presets/justthebuilder.js";
import { loadGuildConfig, saveGuildConfig } from "../storage/guildConfig.js";
import { isBotOwner } from "../entitlements.js";
import { FREE_CHANNEL_LIMIT } from "../../config/marketing.js";
import { countBlueprintChannels } from "../blueprintChannelCap.js";
import fs from "fs";
import path from "path";

function selfHealJSON(raw) {
  if (!raw) return null;
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/```(json)?/gi, "");
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace === -1) return null;
  cleaned = cleaned.slice(0, lastBrace + 1);
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(cleaned);
  } catch {}
  cleaned = cleaned.replace(/([,{\n\r\t ]+)([A-Za-z0-9_]+):/g, (m, pre, key) => `${pre}"${key}":`);
  try {
    return JSON.parse(cleaned);
  } catch {}
  return null;
}

const FEW_SHOT_VALID = [
  {
    style: { emojiPrefix: "💸", theme: "neon-gold" },
    roles: [
      { name: "Admin", permissions: ["Administrator"], color: "#FFD700" },
      { name: "Moderator", permissions: ["ManageMessages", "EmbedLinks"], color: "#DAA520" },
      { name: "Member", color: "#5865F2" }
    ],
    categories: {
      "SERVER INFO": [
        {
          name: "welcome",
          type: "text",
          message: { title: "Welcome", body: "Welcome to the server! Read #rules then chat in #general." }
        },
        {
          name: "rules",
          type: "text",
          permissionsPreset: "public-readonly",
          pinMessage: true,
          message: { title: "Rules", body: "1. Be kind\n2. No spam" }
        },
        { name: "about", type: "text", message: { title: "About", body: "About this community." } },
        { name: "faq", type: "text", message: { title: "FAQ", body: "**Q: How do I start?**\nA: Read rules and say hi." } }
      ],
      COMMUNITY: [
        { name: "general-chat", type: "text" },
        { name: "announcements", type: "announcement", permissionsPreset: "announcement-lock" },
        { name: "voice-lounge", type: "voice" }
      ]
    }
  }
];

const INVALID_AND_CORRECTED = {
  invalid: '{ roles: [ { name: Admin } ], categories: { INFO: [ "welcome" ] } }',
  corrected: {
    roles: [{ name: "Admin", permissions: ["Administrator"] }],
    categories: { INFO: [{ name: "welcome", type: "text" }] }
  }
};

async function generateBlueprint(answers, guild) {
  const brief = buildInterviewBrief(answers, guild);
  let systemExtra = "";
  try {
    const promptPath = path.resolve("src/utils/ai/promptTemplate.md");
    if (fs.existsSync(promptPath)) systemExtra = fs.readFileSync(promptPath, "utf-8");
  } catch {}

  const messages = [
    {
      role: "system",
      content: [
        "You convert interview answers into a STRICT JSON blueprint for a complete Discord server.",
        "Return ONLY JSON (no prose, no backticks).",
        "Deliver a one-and-done setup: channels, roles, permissions, and message embeds where requested.",
        systemExtra
      ].join("\n")
    },
    {
      role: "system",
      content:
        "Valid example:\n" +
        JSON.stringify(FEW_SHOT_VALID[0]) +
        "\n\nInvalid (do NOT emulate):\n" +
        INVALID_AND_CORRECTED.invalid +
        "\n\nCorrected:\n" +
        JSON.stringify(INVALID_AND_CORRECTED.corrected)
    },
    { role: "user", content: brief }
  ];

  const raw = await askAI(messages);
  return selfHealJSON(raw);
}

export async function runInterview(user, guild, client, preset = null, isPremium = false) {
  if (isSupportPreset(preset)) {
    const dm = await user.createDM();
    try {
      await dm.send(JUSTTHEBUILDER_BUILD_SUMMARY);
      const blueprint = loadJustTheBuilderBlueprint(guild);
      const validation = validateBlueprint(blueprint);
      if (!validation.valid) {
        await dm.send(
          "❌ Support preset blueprint invalid:\n" + formatValidationErrors(validation.errors)
        );
        return { ok: false };
      }
      blueprint.lastPreset = "justthebuilder";
      persistBlueprintOnly(guild.id, blueprint);
      saveGuildConfig(guild.id, {
        ...loadGuildConfig(guild.id),
        lastBlueprint: blueprint,
        tickets: blueprint.tickets,
        lastPreset: "justthebuilder"
      });
      await dm.send(
        "✅ Blueprint ready. Choose **Apply free structure** or **Unlock full setup — $0.99** next."
      );
      return { ok: true, blueprint };
    } catch (err) {
      log(`justthebuilder preset failed: ${err.message}`);
      await dm.send(`❌ Support preset build failed: ${err.message}`);
      return { ok: false };
    }
  }

  const answers = [];
  let ticketCategoriesAnswer = "";
  const dm = await user.createDM();
  let selectedRuleTemplate = preset && PRESET_ANSWERS[preset] ? preset : null;

  await dm.send(
    [
      "👋 **JustTheBuilder setup interview** (~12 questions)",
      "Answer in DMs. Pick a **number** from suggestions or type your own.",
      "Goal: **one run** → channels, roles, permissions, and embeds."
    ].join("\n")
  );

  if (preset && PRESET_ANSWERS[preset]) {
    answers.push(...PRESET_ANSWERS[preset]);
    if (parseYes(answers[A.TICKETS])) {
      ticketCategoriesAnswer =
        preset === "support"
          ? "Help, Billing, Bug Report, Feature Request"
          : "General Help, Report, Billing, Technical";
    }
    await user.send(`⚡ **Fast-Track**: Using **${preset}** defaults…`);
  } else {
    async function ask(questionObj) {
      const { text, suggestions } = questionObj;
      let msg = `📋 **${text}**`;
      if (suggestions?.length) {
        msg += "\n\n💡 **Suggestions:**";
        suggestions.forEach((s, i) => {
          msg += `\n  ${i + 1}. ${s}`;
        });
        msg += `\n\n_Type your answer or a number (1-${suggestions.length})_`;
      }
      await dm.send(msg);
      try {
        const collected = await dm.awaitMessages({
          filter: (m) => m.author.id === user.id,
          max: 1,
          time: 180000
        });
        let answer = collected.first()?.content?.trim() || "";
        if (suggestions && /^\d+$/.test(answer)) {
          const idx = parseInt(answer, 10) - 1;
          if (idx >= 0 && idx < suggestions.length) {
            answer = suggestions[idx];
            await dm.send(`✅ Selected: **${answer}**`);
          }
        }
        return answer;
      } catch {
        await dm.send("⏱️ Timeout — skipping this question (you can rerun `/setup run` later).");
        return "";
      }
    }

    for (const q of INTERVIEW_QUESTIONS) {
      const a = await ask(q);
      answers.push(a);

      if (q.id === "info_embeds" && parseYes(a)) {
        const templateChoice = await ask({
          text: "Which rules/FAQ style fits best?",
          suggestions: SUGGESTION_PACKS.ruleTemplates
        });
        selectedRuleTemplate = mapRuleTemplateChoice(templateChoice);
      }

      if (q.id === "extras" && /links:/i.test(a) && /describe|paste|next/i.test(a)) {
        const linksDetail = await ask({
          text: "Paste links or text for welcome/about (one message, or type skip):",
          suggestions: ["skip"]
        });
        if (linksDetail && !/^skip$/i.test(linksDetail)) {
          answers[A.EXTRAS] = `Links: ${linksDetail}`;
        }
      }

      if (q.id === "tickets" && parseYes(a)) {
        ticketCategoriesAnswer = await ask({
          text: "Ticket categories (comma-separated)? Staff will be pinged based on your roles.",
          suggestions: SUGGESTION_PACKS.ticketCategories
        });
      }
    }
  }

  await user.send("🧠 Generating your server blueprint…");

  let blueprint = null;
  let validation = { valid: false, errors: [] };
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await user.send(`🔁 Fixing blueprint (attempt ${attempt})…`);
    blueprint = await generateBlueprint(answers, guild);
    if (!blueprint) {
      await user.send("⚠️ AI returned invalid JSON. Retrying…");
      continue;
    }
    validation = validateBlueprint(blueprint);
    if (validation.valid) break;

    const repairRaw = await askAI([
      { role: "system", content: buildRepairPrompt(validation.errors) },
      { role: "user", content: JSON.stringify(blueprint) }
    ]);
    blueprint = selfHealJSON(repairRaw);
    validation = validateBlueprint(blueprint || {});
    if (validation.valid) break;
  }

  if (!validation.valid) {
    await user.send(
      "❌ Could not produce a valid blueprint.\n" + formatValidationErrors(validation.errors)
    );
    return { ok: false };
  }

  applyBranding(blueprint, answers);
  applyInterviewMeta(blueprint, guild, answers);
  ensureVoiceAndAnnouncements(blueprint, answers);
  applyExtras(blueprint, answers);
  applyTicketsToBlueprint(blueprint, answers, { categoriesAnswer: ticketCategoriesAnswer, preset });

  // Persist the full plan. Free-structure apply caps channels at apply time only.
  const channelCount = countBlueprintChannels(blueprint);
  if (channelCount > FREE_CHANNEL_LIMIT) {
    const owner = isBotOwner(user.id);
    await user.send(
      owner
        ? `ℹ️ Your plan has **${channelCount}** channels. **Apply free structure** uses the first ${FREE_CHANNEL_LIMIT}; **Unlock full setup** (free for bot owner) applies the full plan.`
        : `ℹ️ Your plan has **${channelCount}** channels. **Apply free structure** uses the first ${FREE_CHANNEL_LIMIT}; **Unlock** ($0.99) applies the full plan with roles, embeds & tickets.`
    );
  }

  if (isPremium && blueprint.roles) {
    const hasPremiumRole = blueprint.roles.some((r) =>
      /premium|vip|supporter/i.test(r.name)
    );
    if (!hasPremiumRole) {
      blueprint.roles.push({
        name: "Premium 💎",
        color: "#FFD700",
        permissions: ["ChangeNickname", "AttachFiles", "EmbedLinks", "UseExternalEmojis", "AddReactions"]
      });
      await user.send("💎 Added **Premium 💎** role to your blueprint.");
    }
  }

  const wantsInfo = parseYes(answers[A.INFO_EMBEDS]);
  if (wantsInfo) {
    const { injectedRules, ruleTemplate, faqTemplate } = await injectInfoEmbeds(
      blueprint,
      guild,
      answers,
      selectedRuleTemplate
    );

    await user.send("📋 **Content preview** (posted when you unlock polish):");
    if (injectedRules && ruleTemplate) {
      await user.send(
        `**${ruleTemplate.title}**\n${ruleTemplate.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\n${ruleTemplate.footer}`
      );
    }
    if (faqTemplate) {
      await user.send(
        `**FAQ sample**\n${faqTemplate.slice(0, 2).map((qa) => `Q: ${qa.q}\nA: ${qa.a}`).join("\n\n")}…`
      );
    }
    await user.send(
      "💡 Embeds post when you unlock polish. Tweak later with `/setup edit-message`, or `/setup nuke` + `/setup run` to rebuild."
    );
  } else {
    await user.send(
      "ℹ️ You skipped auto-embeds. Channels will be created empty — run `/setup post-messages` later if you change your mind."
    );
  }

  try {
    persistBlueprintOnly(guild.id, blueprint);
  } catch (err) {
    log(`Persist blueprint failed: ${err.message}`);
    await user.send(`❌ Failed to save your blueprint: ${err.message}`);
    return { ok: false };
  }

  // Paywall DM (sendFreemiumPaywall) carries the "Interview complete" CTA — keep this short.
  await user.send("✅ Blueprint saved. Choose how to build in the next message…");
  return { ok: true, blueprint };
}
