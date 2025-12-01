import { startOnboarding } from "../onboarding/flow.js";

export async function handleGuildCreate(guild, client) {
  try {
    const owner = await guild.fetchOwner();

    await startOnboarding(owner.user, guild, client);

  } catch (err) {
    console.error("DM failed:", err);
    guild.systemChannel?.send(
      "⚠️ I couldn't DM the server owner. Please enable DMs and re-add me."
    );
  }
}
