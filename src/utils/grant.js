// Owner-only: registered as User Install (see ownerCommands.js). Handler checks BOT_OWNER_ID.
import { SlashCommandBuilder, REST, Routes } from "discord.js";
import { asOwnerUserCommand } from "./commands/ownerCommands.js";
import { log } from "./logger.js";
import { grantManualPolishGrant } from "./grandfather.js";

const grantCommandBuilder = new SlashCommandBuilder()
  .setName("grant")
  .setDescription("🎁 [Bot Owner] Grant a free build or Pro access")
  .addSubcommand((sub) =>
    sub
      .setName("free-build")
      .setDescription("One free full /setup run for a server")
      .addStringOption((opt) =>
        opt
          .setName("guild_id")
          .setDescription("Server ID (Developer Mode → Copy Server ID)")
          .setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt
          .setName("notify")
          .setDescription("DM the server owner (default: yes)")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("pro")
      .setDescription("Pro Builder subscription (Discord test entitlement)")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to grant Pro").setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt
          .setName("notify")
          .setDescription("DM the user (default: yes)")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("revoke-pro")
      .setDescription("Remove a test Pro entitlement from a user")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to revoke").setRequired(true)
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName("kofi")
      .setDescription("Ko-fi shop & API (requires KOFI_API_KEY on server)")
      .addSubcommand((sub) =>
        sub.setName("shop-list").setDescription("List Ko-fi shop items via API")
      )
      .addSubcommand((sub) =>
        sub
          .setName("shop-sync")
          .setDescription("Sync shop catalog to data/kofi/shop-catalog.json")
      )
      .addSubcommand((sub) =>
        sub
          .setName("shop-create")
          .setDescription("Create a Ko-fi shop item via API")
          .addStringOption((opt) =>
            opt.setName("name").setDescription("Product name").setRequired(true)
          )
          .addNumberOption((opt) =>
            opt.setName("price").setDescription("Price in USD").setRequired(true)
          )
          .addStringOption((opt) =>
            opt.setName("description").setDescription("Product description").setRequired(false)
          )
      )
  )
  ;

export const GrantCommandData = asOwnerUserCommand(grantCommandBuilder.toJSON());

function isBotOwner(userId) {
  const ownerId = process.env.BOT_OWNER_ID;
  return ownerId && userId === ownerId;
}

function supportLink() {
  return process.env.SUPPORT_SERVER_INVITE || "https://discord.gg/NEePze3rZd";
}

/**
 * @param {import('discord.js').Client} client
 * @param {string} userId
 */
async function createProTestEntitlement(client, userId) {
  const skuId = process.env.SUBSCRIPTION_SKU_ID;
  if (!skuId) throw new Error("SUBSCRIPTION_SKU_ID is not set in env.");

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const appId = client.application.id;

  return rest.post(Routes.entitlements(appId), {
    body: {
      sku_id: skuId,
      owner_id: userId,
      owner_type: 2
    }
  });
}

/**
 * @param {import('discord.js').Client} client
 * @param {string} userId
 */
async function revokeProTestEntitlements(client, userId) {
  const skuId = process.env.SUBSCRIPTION_SKU_ID;
  if (!skuId) throw new Error("SUBSCRIPTION_SKU_ID is not set in env.");

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  const appId = client.application.id;

  const list = await rest.get(Routes.entitlements(appId), {
    query: new URLSearchParams({
      user_id: userId,
      sku_ids: skuId,
      exclude_ended: "true"
    })
  });

  const items = Array.isArray(list) ? list : [];
  let removed = 0;
  for (const ent of items) {
    await rest.delete(Routes.entitlement(appId, ent.id));
    removed++;
  }
  return removed;
}

/**
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Interaction} interaction
 */
export async function handleGrantInteraction(interaction, client) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "grant") return;

  if (!isBotOwner(interaction.user.id)) {
    return interaction.reply({
      ephemeral: true,
      content: "❌ Owner only — set `BOT_OWNER_ID` in env to your Discord user ID."
    });
  }

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();
  const notify = interaction.options.getBoolean("notify") ?? true;

  if (group === "kofi") {
    const { listShopItems, createShopItem, syncShopCatalog } = await import("./kofi/api.js");
    await interaction.deferReply({ ephemeral: true });
    try {
      if (sub === "shop-list") {
        const { items } = await listShopItems();
        if (!items.length) {
          return interaction.editReply({ content: "No shop items returned from Ko-fi API." });
        }
        const lines = items.map((item) => {
          const code = item.direct_link_code || item.directLinkCode || item.code || "?";
          const name = item.name || item.title || "Unnamed";
          const price = item.price ?? item.unit_price ?? "?";
          return `• **${name}** — $${price} — \`${code}\``;
        });
        return interaction.editReply({
          content: ["**Ko-fi shop items**", ...lines].join("\n")
        });
      }
      if (sub === "shop-sync") {
        const items = await syncShopCatalog();
        return interaction.editReply({
          content: `✅ Synced **${items.length}** shop item(s) to \`data/kofi/shop-catalog.json\`.`
        });
      }
      if (sub === "shop-create") {
        const name = interaction.options.getString("name", true);
        const price = interaction.options.getNumber("price", true);
        const description = interaction.options.getString("description") || "";
        const created = await createShopItem({ name, price, description });
        return interaction.editReply({
          content: [
            `✅ **Shop item created:** ${name} ($${price})`,
            "Run `/grant kofi shop-sync` then set `KOFI_SHOP_ITEM_CODE` on Fly if needed.",
            "```json",
            JSON.stringify(created, null, 2).slice(0, 1500),
            "```"
          ].join("\n")
        });
      }
    } catch (err) {
      log(`grant kofi failed: ${err.message}`);
      return interaction.editReply({
        content: `❌ Ko-fi API error: ${err.message}\n_Set KOFI_API_KEY on Fly. Create may be unsupported — use Ko-fi dashboard if needed._`
      });
    }
    return;
  }

  if (sub === "free-build") {
    const guildId = interaction.options.getString("guild_id").trim();
    if (!/^\d{17,20}$/.test(guildId)) {
      return interaction.reply({
        ephemeral: true,
        content: "❌ Invalid `guild_id` — must be a numeric server ID."
      });
    }

    await interaction.deferReply({ ephemeral: true });

    grantManualPolishGrant(guildId);
    const guild = await client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return interaction.editReply({
        content: [
          `✅ **Free build granted** for server \`${guildId}\`.`,
          "Owner can run `/setup run` once after the bot is invited.",
          notify
            ? "\n⚠️ Could not notify — bot is not in that server (no owner DM)."
            : ""
        ].join("\n")
      });
    }

    let notifyResult = "";
    if (notify) {
      try {
        const owner = await guild.fetchOwner();
        await owner.send(
          [
            "🎁 **You've been granted a free server build** on **JustTheBuilder**.",
            "",
            `Server: **${guild.name}**`,
            "",
            "As server owner, run:",
            "`/setup run`",
            "",
            "You'll get a DM interview, then a full AI build (channels, roles, rules, FAQ, embeds).",
            "",
            `Questions? ${supportLink()}`
          ].join("\n")
        );
        notifyResult = `\n📬 DM sent to **${owner.user.tag}**.`;
      } catch (err) {
        notifyResult = `\n⚠️ Could not DM owner: ${err.message}`;
        log(`grant free-build DM failed: ${err.message}`);
      }
    }

    return interaction.editReply({
      content: [
        `✅ **Free build granted** for **${guild.name}** (\`${guildId}\`).`,
        "They can run `/setup run` once (owner only).",
        notifyResult
      ].join("\n")
    });
  }

  if (sub === "pro") {
    const user = interaction.options.getUser("user", true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const ent = await createProTestEntitlement(client, user.id);
      let notifyResult = "";
      if (notify) {
        try {
          await user.send(
            [
              "🧪 **Legacy test entitlement added** on **JustTheBuilder**.",
              "",
              "This is a developer/QA subscription flag for testing — not a live product tier.",
              "If you're helping test builds, run `/setup run` in a server you own.",
              "",
              `Support: ${supportLink()}`
            ].join("\n")
          );
          notifyResult = "\n📬 User notified by DM.";
        } catch (err) {
          notifyResult = `\n⚠️ Could not DM user: ${err.message}`;
        }
      }

      return interaction.editReply({
        content: [
          `✅ **Legacy test entitlement granted** to **${user.tag}** (\`${user.id}\`).`,
          ent?.id ? `Entitlement: \`${ent.id}\`` : "",
          "_They may need to restart Discord for entitlements to refresh._",
          notifyResult
        ]
          .filter(Boolean)
          .join("\n")
      });
    } catch (err) {
      log(`grant pro failed: ${err.message}`);
      return interaction.editReply({
        content: `❌ Failed to grant Pro: ${err.message}\n_Check SUBSCRIPTION_SKU_ID and Developer Portal monetization._`
      });
    }
  }

  if (sub === "revoke-pro") {
    const user = interaction.options.getUser("user", true);
    await interaction.deferReply({ ephemeral: true });
    try {
      const removed = await revokeProTestEntitlements(client, user.id);
      let notifyResult = "";
      if (removed > 0) {
        try {
          await user.send(
            [
              "🧪 **Legacy test entitlement removed** on **JustTheBuilder**.",
              "",
              "Your developer/QA subscription test flag was revoked — no product access changed.",
              "",
              `Support: ${supportLink()}`
            ].join("\n")
          );
          notifyResult = "\n📬 User notified by DM.";
        } catch (err) {
          notifyResult = `\n⚠️ Could not DM user: ${err.message}`;
        }
      }

      return interaction.editReply({
        content:
          (removed > 0
            ? `✅ Removed **${removed}** legacy test entitlement(s) from **${user.tag}**.`
            : `ℹ️ No active legacy test entitlements found for **${user.tag}**.`) +
          notifyResult
      });
    } catch (err) {
      log(`revoke pro failed: ${err.message}`);
      return interaction.editReply({
        content: `❌ Revoke failed: ${err.message}`
      });
    }
  }
}
