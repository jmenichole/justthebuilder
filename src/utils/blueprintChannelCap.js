import { FREE_CHANNEL_LIMIT } from "../config/marketing.js";

/**
 * Count text/voice/etc channels across blueprint categories (excludes category keys).
 * @param {Object} blueprint
 * @returns {number}
 */
export function countBlueprintChannels(blueprint) {
  if (!blueprint?.categories) return 0;
  return Object.values(blueprint.categories).reduce(
    (sum, channels) => sum + (Array.isArray(channels) ? channels.length : 0),
    0
  );
}

/**
 * Return a deep-cloned blueprint with channel count capped for free structure apply.
 * Does not mutate the original (so unlock can still use the full plan).
 * @param {Object} blueprint
 * @param {number} [limit=FREE_CHANNEL_LIMIT]
 * @returns {{ blueprint: Object, truncated: boolean, kept: number, total: number }}
 */
export function cloneBlueprintWithChannelCap(blueprint, limit = FREE_CHANNEL_LIMIT) {
  const clone = structuredClone(blueprint);
  const total = countBlueprintChannels(clone);
  if (!clone.categories || total <= limit) {
    return { blueprint: clone, truncated: false, kept: total, total };
  }

  let count = 0;
  let truncated = false;
  for (const catName of Object.keys(clone.categories)) {
    const channels = clone.categories[catName];
    if (!Array.isArray(channels)) continue;
    if (count >= limit) {
      clone.categories[catName] = [];
      truncated = true;
    } else if (count + channels.length > limit) {
      clone.categories[catName] = channels.slice(0, limit - count);
      count = limit;
      truncated = true;
    } else {
      count += channels.length;
    }
  }

  return { blueprint: clone, truncated, kept: count, total };
}
