import { buildSurpriseGrantOwnerDm } from "../../config/help.js";
import { startOnboarding } from "../onboarding/flow.js";
import { logStaffUsage } from "../staffLog.js";
import { postGuildInstall, postSurpriseGrant } from "../ops.js";
import { trySurpriseGrantForGuild } from "../surpriseGrant.js";
import { log } from "../logger.js";

export async function handleGuildCreate(guild, client) {
  try {
    postGuildInstall(guild);
    const owner = await guild.fetchOwner();
    logStaffUsage(client, {
      action: "Bot added to server",
      guild,
      user: owner.user,
      color: 0x2ecc71,
      detail: `Members: ${guild.memberCount ?? "?"}`
    });

    const surprise = trySurpriseGrantForGuild(guild);
    if (surprise.awarded) {
      postSurpriseGrant(guild, {
        installNumber: surprise.installNumber,
        grantsAwarded: surprise.grantsAwarded
      });
      try {
        await owner.send(
          buildSurpriseGrantOwnerDm({
            guildName: guild.name,
            hasBlueprint: surprise.hasBlueprint
          })
        );
      } catch (err) {
        log(`Surprise grant DM failed for ${guild.id}: ${err.message}`);
        await guild.systemChannel
          ?.send(
            "🎉 **Surprise!** This server won a **free full unlock**. Server owner: run **`/setup run`** then **`/setup unlock`** (or just **`/setup unlock`** if you already interviewed)."
          )
          .catch(() => {});
      }
    }

    await startOnboarding(owner.user, guild, client);
  } catch (err) {
    console.error("DM failed:", err);
    guild.systemChannel?.send(
      "⚠️ I couldn't DM the server owner. Please enable DMs and re-add me — or run **`/help`** here for setup steps."
    );
  }
}
