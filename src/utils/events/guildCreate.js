import { startOnboarding } from "../onboarding/flow.js";
import { logStaffUsage } from "../staffLog.js";
import { recordFunnelStep } from "../funnel.js";

// Single-post install event: recordFunnelStep owns the analytics embed for
// guild_install (writes funnel.installedAt + posts). Do not also call
// postGuildInstall here — that would double-post the same install embed.
export async function handleGuildCreate(guild, client) {
  let owner;
  try {
    owner = await guild.fetchOwner();
  } catch (err) {
    console.error("fetchOwner failed:", err);
    recordFunnelStep(guild, "guild_install", {
      title: "🟢 Bot added to server",
      color: 0x2ecc71,
      fields: [{ name: "Members", value: String(guild.memberCount ?? "?"), inline: true }]
    });
    return;
  }

  recordFunnelStep(guild, "guild_install", {
    owner: owner.user,
    title: "🟢 Bot added to server",
    color: 0x2ecc71,
    fields: [{ name: "Members", value: String(guild.memberCount ?? "?"), inline: true }]
  });

  logStaffUsage(client, {
    action: "Bot added to server",
    guild,
    user: owner.user,
    color: 0x2ecc71,
    detail: `Members: ${guild.memberCount ?? "?"}`
  });

  try {
    await startOnboarding(owner.user, guild, client);
    recordFunnelStep(guild, "onboarding_dm_sent", { owner: owner.user });
  } catch (err) {
    console.error("DM failed:", err);
    recordFunnelStep(guild, "onboarding_dm_failed", {
      owner: owner.user,
      description: err.message
    });
    guild.systemChannel?.send(
      "⚠️ I couldn't DM the server owner. Please enable DMs and re-add me."
    ).catch(() => {});
  }
}
