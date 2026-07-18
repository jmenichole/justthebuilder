/**
 * Discord monetization / access helpers.
 */

import { hasGrandfatherFullLeft } from "./grandfather.js";
import { loadGuildConfig } from "./storage/guildConfig.js";
import { getPolishCredits } from "./userCredits.js";

export function isBotOwner(userId) {
  const ownerId = process.env.BOT_OWNER_ID;
  return Boolean(ownerId && userId === ownerId);
}

/**
 * Active Pro Builder subscription (not consumable basic pack).
 * @param {import('discord.js').Client} client
 * @param {string} userId
 * @param {import('discord.js').Collection|Array} [interactionEntitlements]
 */
export async function userHasProSubscription(client, userId, interactionEntitlements) {
  const subSkuId = process.env.SUBSCRIPTION_SKU_ID;
  if (!subSkuId) return false;

  if (interactionEntitlements) {
    const list =
      typeof interactionEntitlements.values === "function"
        ? [...interactionEntitlements.values()]
        : [...interactionEntitlements];
    if (list.some((e) => e.skuId === subSkuId && !e.consumed)) return true;
  }

  try {
    const ents = await client.application.entitlements.fetch({
      userId,
      excludeEnded: true
    });
    return ents.some((e) => e.skuId === subSkuId);
  } catch {
    return false;
  }
}

/**
 * Support tickets: Pro subscribers + bot owner (always free).
 */
export async function canOpenSupportTicket(client, userId, interactionEntitlements) {
  if (isBotOwner(userId)) return { allowed: true, reason: "owner" };
  if (await userHasProSubscription(client, userId, interactionEntitlements)) {
    return { allowed: true, reason: "pro" };
  }
  return { allowed: false, reason: "pro_required" };
}

export function findUnconsumedBasicPack(entitlements) {
  const sku = process.env.PREMIUM_SKU_ID;
  if (!sku || !entitlements) return null;
  const list =
    typeof entitlements.values === "function"
      ? [...entitlements.values()]
      : [...entitlements];
  return list.find((e) => e.skuId === sku && !e.consumed) || null;
}

/**
 * @returns {{ allowed: boolean, reason: 'owner'|'pack'|'credit'|'manual_grant'|'grandfather'|'denied' }}
 */
export function canApplyPolish(interaction, guild) {
  if (isBotOwner(interaction.user.id)) return { allowed: true, reason: "owner" };
  if (findUnconsumedBasicPack(interaction.entitlements)) {
    return { allowed: true, reason: "pack" };
  }
  if (getPolishCredits(interaction.user.id) > 0) {
    return { allowed: true, reason: "credit" };
  }
  if (guild) {
    const cfg = loadGuildConfig(guild.id);
    if (cfg.manualPolishGrant === true) {
      return { allowed: true, reason: "manual_grant" };
    }
    if (hasGrandfatherFullLeft(guild)) {
      return { allowed: true, reason: "grandfather" };
    }
  }
  return { allowed: false, reason: "denied" };
}

export function guildHasPolishApplied(guildId) {
  const cfg = loadGuildConfig(guildId);
  return Boolean(cfg.polishAppliedAt);
}
