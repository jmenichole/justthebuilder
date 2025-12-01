import { Client, GatewayIntentBits, Partials, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import { handleGuildCreate } from "./events/guildCreate.js";
import { SetupCommandData, handleSetupInteraction } from "./commands/setup.js";
import { handleOnboardingComponent, handlePostBuildButtons } from "./onboarding/flow.js";
import { log } from "./logger.js";

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
  if (!process.env.AI_GATEWAY_URL) {
    log("Warning: AI_GATEWAY_URL not set; interview AI calls will fail.");
  }
  if (!process.env.AI_GATEWAY_KEY) {
    log("Warning: AI_GATEWAY_KEY not set; interview AI calls will fail.");
  }
}
assertEnv();

// Minimal intents: remove privileged (GuildMembers, MessageContent) to avoid gateway rejection.
// DM interview works without MessageContent because DM message content is accessible.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel]
});

client.once("ready", async () => {
  log(`Ready as ${client.user.tag}`);
  // Register slash command globally (could be per guild for faster propagation)
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: [SetupCommandData] });
    log("Registered /setup command");
  } catch (err) {
    log(`Command registration failed: ${err.message}`);
  }
});

client.on("guildCreate", (guild) => handleGuildCreate(guild, client));
client.on("interactionCreate", (i) => {
  handleSetupInteraction(i, client);
  handleOnboardingComponent(i, client);
  handlePostBuildButtons(i, client);
});

client.login(process.env.DISCORD_TOKEN);
