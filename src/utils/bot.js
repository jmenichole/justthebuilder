import { Client, GatewayIntentBits, Partials, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { handleGuildCreate } from "./events/guildCreate.js";
import { SetupCommandData, handleSetupInteraction, handleFreemiumButtons } from "./commands/setup.js";
import { handleOnboardingComponent, handlePostBuildButtons } from "./onboarding/flow.js";
import { log } from "./logger.js";
import { skuIdsMatch } from "./entitlements.js";

// Try multiple env locations (root .env first, then src/config/.env)
const envCandidates = [".env", "src/config/.env"];
for (const p of envCandidates) {
  try {
    const res = dotenv.config({ path: p });
    if (!res.error) { log(`Loaded environment from ${p}`); break; }
  } catch {}
}

// Validate essential environment variables early with helpful hints
function assertEnv() {
  let token = process.env.DISCORD_TOKEN;
  if (token) token = token.trim();
  if (!token || token.length < 10) {
    console.error("[FATAL] DISCORD_TOKEN missing or too short.\n" +
      "Place your token in project root .env (preferred) or src/config/.env\n" +
      "Example:\nDISCORD_TOKEN=YOUR_BOT_TOKEN\n" +
      "Portal: https://discord.com/developers/applications -> Bot -> Bot -> Reset Token");
    console.error("Current working directory:", process.cwd());
    process.exit(1);
  }
  const masked = token.slice(0, 6) + "..." + token.slice(-4);
  log(`Token loaded (masked): ${masked}`);
  if (!process.env.GROQ_API_KEY) {
    log("Warning: GROQ_API_KEY not set; AI calls will fail. Get a free key at https://console.groq.com");
  }
}
assertEnv();

// Minimal intents: remove privileged (GuildMembers, MessageContent) to avoid gateway rejection.
// DM interview works without MessageContent because DM message content is accessible.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

client.once("clientReady", async () => {
  log(`Ready as ${client.user.tag} | Guilds: ${client.guilds.cache.size}`);

  const { initOps } = await import("./ops.js");
  initOps(client);

  // Initialize early adopters list on first boot
  const dataDir = path.resolve("data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const earlyAdoptersPath = path.join(dataDir, "early_adopters.json");
  if (!fs.existsSync(earlyAdoptersPath)) {
    const guildIds = client.guilds.cache.map(g => g.id);
    fs.writeFileSync(earlyAdoptersPath, JSON.stringify(guildIds, null, 2));
    log(`Saved ${guildIds.length} early adopter guilds to ${earlyAdoptersPath}`);
  }

  // Start health server so Railway can confirm the bot is alive
  const { startHealthServer } = await import("./health.js");
  startHealthServer(client);

  // /setup = guild install (all servers). /grant + /announce = user install (owner account only).
  try {
    const { AnnounceCommandData } = await import("./announce.js");
    const { GrantCommandData } = await import("./grant.js");
    const { asGuildCommand } = await import("./commands/ownerCommands.js");
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: [asGuildCommand(SetupCommandData), AnnounceCommandData, GrantCommandData]
    });
    log("Registered /setup (guild), /announce + /grant (user-install owner)");
  } catch (err) {
    log(`Command registration failed: ${err.message}`);
  }
});

client.on("guildCreate", (guild) => handleGuildCreate(guild, client));

client.on("guildDelete", (guild) => {
  import("./staffLog.js").then(({ logStaffUsage }) =>
    logStaffUsage(client, {
      action: "Bot removed from server",
      guild,
      user: null,
      color: 0xe74c3c,
      detail: `Member count: ${guild.memberCount ?? "?"}`
    })
  );
});

client.on("interactionCreate", async (i) => {
  try {
    if (i.isChatInputCommand()) {
      const { logStaffSlashCommand } = await import("./staffLog.js");
      logStaffSlashCommand(i);
    }

    const { handleTicketInteraction } = await import("./tickets/handler.js");
    if (await handleTicketInteraction(i, client)) return;

    if (await handleFreemiumButtons(i, client)) return;

    const { handleAnnounceInteraction } = await import("./announce.js");
    const { handleGrantInteraction } = await import("./grant.js");
    await handleSetupInteraction(i, client);
    handleOnboardingComponent(i, client);
    handlePostBuildButtons(i, client);
    await handleAnnounceInteraction(i, client);
    await handleGrantInteraction(i, client);
  } catch (err) {
    log(`Interaction error: ${err.message}`);
    const { postError } = await import("./ops.js");
    postError({
      context: `interaction:${i.commandName || i.customId || "unknown"}`,
      message: err.message || String(err),
      stack: err.stack,
    });
    if (i.isRepliable?.() && !i.replied && !i.deferred) {
      await i.reply({ ephemeral: true, content: "❌ Something went wrong. Try again." }).catch(() => {});
    }
  }
});

process.on("uncaughtException", async (err) => {
  console.error("uncaughtException:", err);
  try {
    const { postError } = await import("./ops.js");
    postError({ context: "uncaughtException", message: err.message, stack: err.stack });
  } catch {}
});

process.on("unhandledRejection", async (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  console.error("unhandledRejection:", reason);
  try {
    const { postError } = await import("./ops.js");
    postError({ context: "unhandledRejection", message, stack });
  } catch {}
});

// DM buyers immediately when a new purchase comes in while the bot is online
client.on("entitlementCreate", async (entitlement) => {
  log(`New entitlement: SKU ${entitlement.skuId} for user ${entitlement.userId}`);
  const basicPackId = process.env.PREMIUM_SKU_ID;
  const subId = process.env.SUBSCRIPTION_SKU_ID;
  let skuLabel = String(entitlement.skuId);
  if (String(entitlement.skuId) === String(basicPackId)) skuLabel = "Basic Build Pack";
  else if (String(entitlement.skuId) === String(subId)) skuLabel = "Legacy subscription";
  try {
    const { postPurchase } = await import("./ops.js");
    postPurchase({ userId: entitlement.userId, skuId: entitlement.skuId, skuLabel });
  } catch {}
  try {
    const user = await client.users.fetch(entitlement.userId);
    const { logStaffUsage } = await import("./staffLog.js");
    logStaffUsage(client, {
      action: "💰 Purchase / entitlement",
      guild: null,
      user,
      color: 0xf1c40f,
      detail: `SKU \`${entitlement.skuId}\` · type ${entitlement.type ?? "?"}`
    });
  } catch {}
  const supportLink = process.env.SUPPORT_SERVER_INVITE || "https://discord.gg/NEePze3rZd";

  let message = "";
  if (skuIdsMatch(entitlement.skuId, basicPackId)) {
    message = [
      "🎉 **Thanks for grabbing the Basic Build Pack!**",
      "",
      "Your pack is ready to use. Here's how to start:",
      "1. Go to any Discord server **you own**",
      "2. Run `/setup run` — the bot will DM you a quick interview",
      "3. Run `/setup unlock` to apply roles, permissions, embeds, pins & tickets",
      "",
      "Your pack covers **one complete server build** on that server.",
      "",
      "💡 **Already finished the interview?** Press **Unlock full setup** in your DMs — or run `/setup unlock` in your server if the button doesn't respond.",
      "",
      `Need help? Join our support server: ${supportLink}`
    ].join("\n");
  } else if (skuIdsMatch(entitlement.skuId, subId)) {
    message = [
      "🎉 **Thanks for your purchase!**",
      "",
      "Your access is active. In any server you own:",
      "• `/setup run` — interview + free structure",
      "• `/setup unlock` — apply full polish from your saved blueprint",
      "",
      `Need help? Join our support server: ${supportLink}`
    ].join("\n");
  } else {
    message = `🎉 Thanks for your purchase! Run \`/setup run\` in any server you own to get started.\n\nSupport: ${supportLink}`;
  }

  try {
    const user = await client.users.fetch(entitlement.userId);
    await user.send(message);
    log(`Entitlement DM sent to ${entitlement.userId}`);
  } catch (err) {
    log(`Failed to DM entitlement holder ${entitlement.userId}: ${err.message}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
