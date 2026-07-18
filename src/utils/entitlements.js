/**
 * Discord monetization / access helpers.
 */

import { hasGrandfatherFullLeft } from "./grandfather.js";
import { loadGuildConfig } from "./storage/guildConfig.js";
import { log } from "./logger.js";

export function isBotOwner(userId) {
  const ownerId = process.env.BOT_OWNER_ID;
  return Boolean(ownerId && userId === ownerId);
}

function entitlementsToList(entitlements) {
  if (!entitlements) return [];
  return typeof entitlements.values === "function"
    ? [...entitlements.values()]
    : [...entitlements];
}

/** Compare Discord SKU snowflakes regardless of string/number typing. */
export function skuIdsMatch(a, b) {
  return a != null && b != null && String(a) === String(b);
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
    const list = entitlementsToList(interactionEntitlements);
    if (list.some((e) => skuIdsMatch(e.skuId, subSkuId) && !e.consumed)) return true;
  }

  try {
    const ents = await client.application.entitlements.fetch({
      userId,
      excludeEnded: true
    });
    return ents.some((e) => skuIdsMatch(e.skuId, subSkuId));
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
  const list = entitlementsToList(entitlements);
  return list.find((e) => skuIdsMatch(e.skuId, sku) && !e.consumed) || null;
}

/**
 * Merge interaction entitlements with a live API fetch.
 * DM button clicks often omit interaction.entitlements even after purchase.
 * @param {import('discord.js').Client} client
 * @param {string} userId
 * @param {import('discord.js').Collection|Array} [interactionEntitlements]
 */
export async function fetchUserEntitlements(client, userId, interactionEntitlements) {
  const fromInteraction = entitlementsToList(interactionEntitlements);
  if (findUnconsumedBasicPack(fromInteraction)) return fromInteraction;
  if (!client?.application?.entitlements?.fetch) return fromInteraction;

  try {
    const fetched = await client.application.entitlements.fetch({
      userId,
      excludeEnded: true
    });
    const merged = new Map();
    for (const e of fromInteraction) {
      if (e?.id != null) merged.set(String(e.id), e);
    }
    for (const e of fetched.values()) {
      merged.set(String(e.id), e);
    }
    return [...merged.values()];
  } catch (err) {
    log(`fetchUserEntitlements failed for ${userId}: ${err.message}`);
    return fromInteraction;
  }
}

/**
 * @returns {Promise<{ allowed: boolean, reason: 'owner'|'pack'|'manual_grant'|'grandfather'|'denied', packEntitlement?: object }>}
 */
export async function canApplyPolish(interaction, guild) {
  if (isBotOwner(interaction.user.id)) return { allowed: true, reason: "owner" };

  const entitlements = await fetchUserEntitlements(
    interaction.client,
    interaction.user.id,
    interaction.entitlements
  );
  const pack = findUnconsumedBasicPack(entitlements);
  if (pack) return { allowed: true, reason: "pack", packEntitlement: pack };

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
