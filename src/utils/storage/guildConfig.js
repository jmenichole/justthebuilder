import fs from 'fs';
import path from 'path';
import { log } from '../logger.js';

const cache = new Map();
const baseDir = path.resolve('data', 'guilds');
if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

/**
 * Load config for a guild, cached in-memory.
 * @param {string} guildId
 * @returns {object}
 */
export function loadGuildConfig(guildId) {
  if (cache.has(guildId)) return cache.get(guildId);
  const file = path.join(baseDir, guildId + '.json');
  let data = {};
  if (fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (err) { log('Config parse failed: ' + err.message); }
  }
  cache.set(guildId, data);
  return data;
}

/**
 * Save guild config and update cache.
 * @param {string} guildId
 * @param {object} data
 */
export function saveGuildConfig(guildId, data) {
  try {
    const file = path.join(baseDir, guildId + '.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    cache.set(guildId, data);
  } catch (err) {
    log('Config save failed: ' + err.message);
  }
}
