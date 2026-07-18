/** Answer indices — keep in sync with questions[] and PRESET_ANSWERS */
export const A = {
  ABOUT: 0,
  BRANDING: 1,
  STYLE: 2,
  CHANNELS: 3,
  INFO_EMBEDS: 4,
  VOICE_ANNOUNCE: 5,
  ROLES: 6,
  PRIVATE: 7,
  EXTRAS: 8,
  TICKETS: 9,
  COMMUNITY: 10,
  CUSTOM: 11
};

export const SUGGESTION_PACKS = {
  serverType: [
    "Gaming community",
    "Crypto/NFT project",
    "Content creator fan server",
    "Study/education group",
    "Business/professional network",
    "Support/help desk"
  ],
  branding: ["💎", "🎮", "🛡️", "💸", "🎥", "skip (no emoji prefix)"],
  styles: [
    "neon-gold (vibrant, energetic)",
    "minimal-clean (simple, professional)",
    "dark-cyberpunk (edgy, tech)",
    "pastel-cozy (warm, friendly)",
    "streamer-purple (gaming, content)"
  ],
  channels: [
    "SERVER INFO, COMMUNITY, GENERAL",
    "WELCOME, RULES, ANNOUNCEMENTS, GENERAL CHAT, VOICE",
    "INFO, SUPPORT, FAQ, GENERAL",
    "ANNOUNCEMENTS, DISCUSSION, MEDIA, VOICE",
    "STAFF (private), PUBLIC, COMMUNITY"
  ],
  yesNoDefaultYes: ["yes (recommended)", "no"],
  voiceAnnounce: ["both voice + announcements", "voice only", "announcements only", "neither"],
  roles: [
    "Admin, Moderator, Member",
    "Owner, Admin, Mod, VIP, Verified",
    "Admin, Support Agent, Member",
    "Founder, Mod, Holder, Member"
  ],
  privateAreas: [
    "staff-chat, mod-logs",
    "admin-only, team-planning",
    "ticket-logs, staff-area",
    "none"
  ],
  extras: [
    "none",
    "verified-only: holders-lounge",
    "Links: add my website/socials in welcome (describe in next message)"
  ],
  tickets: ["yes (recommended)", "no"],
  ticketCategories: [
    "General Help, Report, Billing, Technical",
    "Help, Billing, Bug Report, Feature Request",
    "General, Moderation, Partnership, Other"
  ],
  yesNo: ["yes", "no"],
  ruleTemplates: [
    "Auto-detect from server type",
    "Gaming community rules",
    "Crypto/DeFi guidelines",
    "Support server rules",
    "Content creator rules",
    "Professional/business rules"
  ]
};

export const INTERVIEW_QUESTIONS = [
  {
    id: "about",
    text: "What is this server about? (1–2 sentences — used for welcome, about & AI layout)",
    suggestions: SUGGESTION_PACKS.serverType
  },
  {
    id: "branding",
    text: "Branding emoji prefix for channel names? (or skip)",
    suggestions: SUGGESTION_PACKS.branding
  },
  {
    id: "style",
    text: "Describe the vibe / visual theme.",
    suggestions: SUGGESTION_PACKS.styles
  },
  {
    id: "channels",
    text: "List categories and main channels you want (comma-separated). Include welcome, rules, chat, voice, etc. if you need them.",
    suggestions: SUGGESTION_PACKS.channels
  },
  {
    id: "info_embeds",
    text: "Auto-post welcome, rules, about & FAQ embeds on first build? (recommended: yes)",
    suggestions: SUGGESTION_PACKS.yesNoDefaultYes
  },
  {
    id: "voice_announce",
    text: "Voice lounge and/or staff-only announcements channel?",
    suggestions: SUGGESTION_PACKS.voiceAnnounce
  },
  {
    id: "roles",
    text: "List roles (comma-separated). Include Mod/Admin if you need staff tools.",
    suggestions: SUGGESTION_PACKS.roles
  },
  {
    id: "private",
    text: "Private staff channels (comma-separated), or none.",
    suggestions: SUGGESTION_PACKS.privateAreas
  },
  {
    id: "extras",
    text: "Extras: verified-only areas or links for welcome/about?",
    suggestions: SUGGESTION_PACKS.extras
  },
  {
    id: "tickets",
    text: "Enable support tickets? (private channels + staff pings — anyone can open)",
    suggestions: SUGGESTION_PACKS.tickets
  },
  {
    id: "community",
    text: "Mark server as Discord Community (welcome screen metadata)?",
    suggestions: SUGGESTION_PACKS.yesNo
  },
  {
    id: "custom",
    text:
      "Anything else in plain English? (extra channels, rules, integrations, vibes — or type **skip**)",
    suggestions: ["skip", "none"]
  }
];

/** Fast-track presets — one answer per INTERVIEW_QUESTIONS entry */
export const PRESET_ANSWERS = {
  gaming: [
    "A gaming community for players to hang out, find groups, and discuss games.",
    "🎮",
    "neon-gold (vibrant, energetic)",
    "SERVER INFO, COMMUNITY, GENERAL — channels: welcome, rules, about, announcements, general-chat, lfg, clips, voice-lounge",
    "yes",
    "both voice + announcements",
    "Admin, Moderator, VIP, Member",
    "staff-chat, mod-logs",
    "none",
    "yes",
    "yes",
    "skip"
  ],
  crypto: [
    "A crypto/NFT project server for holders and roadmap updates.",
    "💎",
    "dark-cyberpunk (edgy, tech)",
    "OFFICIAL, COMMUNITY, GENERAL — channels: welcome, rules, about, faq, announcements, general, price-talk, holders-only, voice",
    "yes",
    "both voice + announcements",
    "Founder, Mod, Holder, Verified, Member",
    "team-chat, mod-logs",
    "verified-only: holders-only",
    "yes",
    "yes",
    "skip"
  ],
  content: [
    "A community for content creators and fans to share videos and streams.",
    "🎥",
    "streamer-purple (gaming, content)",
    "INFO, LIVE, COMMUNITY — channels: welcome, rules, about, announcements, general, fan-art, clips, live-chat, voice-lounge",
    "yes",
    "both voice + announcements",
    "Streamer, Mod, Subscriber, Follower",
    "mod-chat, planning",
    "none",
    "yes",
    "yes",
    "skip"
  ],
  professional: [
    "A professional network for business discussions and networking.",
    "skip (no emoji prefix)",
    "minimal-clean (simple, professional)",
    "INFO, NETWORKING, GENERAL — channels: welcome, rules, about, resources, networking, jobs, general",
    "yes",
    "announcements only",
    "Admin, Moderator, Professional, Member",
    "admin-only, reports",
    "none",
    "no",
    "yes",
    "skip"
  ],
  support: [
    "A product support server for helping users with issues.",
    "🛡️",
    "pastel-cozy (warm, friendly)",
    "INFO, SUPPORT, COMMUNITY — channels: welcome, rules, about, faq, announcements, create-ticket, general, bot-spam",
    "yes",
    "announcements only",
    "Admin, Support Agent, Member",
    "staff-area, ticket-logs",
    "none",
    "yes",
    "yes",
    "skip"
  ]
};

export function formatCustomRequest(answer) {
  const t = (answer || "").trim();
  if (!t || /^skip$/i.test(t) || /^none$/i.test(t)) return "";
  return t;
}

export function parseYes(answer) {
  const a = (answer || "").toLowerCase();
  if (a.startsWith("no") || a === "n") return false;
  return a.includes("yes") || a.includes("y") || a.includes("recommended") || a.includes("both");
}

export function parseVoiceAnnounce(answer) {
  const a = (answer || "").toLowerCase();
  return {
    voice: a.includes("both") || a.includes("voice"),
    announcements: a.includes("both") || a.includes("announce")
  };
}

export function mapRuleTemplateChoice(choice) {
  const c = (choice || "").toLowerCase();
  if (c.includes("gaming")) return "gaming";
  if (c.includes("crypto") || c.includes("defi")) return "crypto";
  if (c.includes("support")) return "support";
  if (c.includes("content") || c.includes("creator")) return "content";
  if (c.includes("professional") || c.includes("business")) return "professional";
  return null;
}

/**
 * Structured brief for the AI blueprint generator.
 */
export function buildInterviewBrief(answers, guild) {
  const { voice, announcements } = parseVoiceAnnounce(answers[A.VOICE_ANNOUNCE]);
  return [
    `Guild name: ${guild.name}`,
    `---`,
    `About: ${answers[A.ABOUT]}`,
    `Branding emoji prefix: ${answers[A.BRANDING]}`,
    `Theme/style: ${answers[A.STYLE]}`,
    `Categories & channels requested: ${answers[A.CHANNELS]}`,
    `Auto-post welcome/rules/about/faq embeds: ${answers[A.INFO_EMBEDS]}`,
    `Include voice channel: ${voice ? "yes" : "no"}`,
    `Include announcements channel (announcement-lock preset): ${announcements ? "yes" : "no"}`,
    `Roles: ${answers[A.ROLES]}`,
    `Private staff channels: ${answers[A.PRIVATE]}`,
    `Extras (verified areas, links): ${answers[A.EXTRAS]}`,
    `Support ticket system: ${answers[A.TICKETS]}`,
    `Discord Community flag: ${answers[A.COMMUNITY]}`,
    `Custom requests (natural language — honor when possible): ${formatCustomRequest(answers[A.CUSTOM]) || "(none)"}`,
    `---`,
    `Requirements:`,
    `- Output MUST include style.theme and style.emojiPrefix when branding is not skip.`,
    `- INFO category MUST include welcome, rules (public-readonly + pinMessage), about, faq when embeds=yes.`,
    `- Each info channel needs message: { title, body } with real copy derived from About.`,
    `- Keep message.body short (2–4 short paragraphs separated by blank lines). Put URLs in message.sections as { header: "Links", bullets: [...] } — never one dense paragraph.`,
    `- rules permissionsPreset: public-readonly; announcements permissionsPreset: announcement-lock.`,
    `- At least one general chat; staff private channels use staff-private or mods-only presets.`,
    `- Honor extras (verified-only channels, links in welcome/about bodies).`,
    `- If Custom requests is not empty: add channels, topics, or embed copy exactly as described when schema allows.`,
    `- If tickets=yes: include create-ticket channel (public-readonly) and tickets config in blueprint.`,
    `- tickets object: { enabled: true, panelChannel: "create-ticket", categories: [{id,label,description,emoji}], staffRoles: [from roles list] }`
  ].join("\n");
}
