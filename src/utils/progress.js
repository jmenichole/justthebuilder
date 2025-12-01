import { log } from "./logger.js";

/**
 * Send a progress DM to the owner if possible.
 * Silently logs failures (e.g., DMs disabled).
 * @param {import('discord.js').User} user
 * @param {string} text
 */
export async function sendProgress(user, text) {
  if (!user) return;
  try {
    await user.send(text);
  } catch (err) {
    log(`Progress DM failed: ${err.message}`);
  }
}
