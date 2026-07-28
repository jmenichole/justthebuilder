import fs from "fs";
import path from "path";
import { loadPersistedBlueprint } from "./applyBlueprint.js";

const CHANNEL_KEEP = new Set([
  "name",
  "type",
  "topic",
  "readOnly",
  "private",
  "allowedRoles",
  "permissions",
  "permissionsPreset",
  "order",
  "threadsLocked",
  "defaultAutoArchiveDuration",
  "message",
  "pinMessage",
  "emoji"
]);

const ROLE_KEEP = new Set(["name", "color", "permissions", "isStaff", "isModerator"]);

/**
 * Normalize channel names for matching (strip emoji/branding prefixes).
 * @param {string} name
 */
export function normalizeChannelKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * @param {object} ch
 */
function sanitizeChannel(ch) {
  const out = {};
  for (const key of CHANNEL_KEEP) {
    if (ch[key] !== undefined) out[key] = ch[key];
  }
  if (!out.name) return null;
  if (!out.type) out.type = "text";
  return out;
}

/**
 * @param {object} role
 */
function sanitizeRole(role) {
  const out = {};
  for (const key of ROLE_KEEP) {
    if (role[key] !== undefined) out[key] = role[key];
  }
  if (!out.name) return null;
  if (out.color && !String(out.color).startsWith("#")) {
    out.color = `#${out.color}`;
  }
  return out;
}

/**
 * Build a channel-name → message map from a saved interview blueprint.
 * @param {object|null} saved
 */
function messageIndexFromBlueprint(saved) {
  const index = new Map();
  if (!saved?.categories) return index;
  for (const channels of Object.values(saved.categories)) {
    if (!Array.isArray(channels)) continue;
    for (const ch of channels) {
      const key = normalizeChannelKey(ch.name);
      if (key && ch.message) index.set(key, ch);
    }
  }
  return index;
}

/**
 * Convert a nuke safety backup (or a blueprint-shaped JSON) into an applyable blueprint.
 * Merges welcome/rules/about/faq embeds + tickets from the guild's saved interview when present.
 *
 * @param {object} backup
 * @param {{ savedBlueprint?: object|null }} [opts]
 * @returns {{ ok: true, blueprint: object, stats: object } | { ok: false, error: string }}
 */
export function nukeBackupToBlueprint(backup, { savedBlueprint = null } = {}) {
  if (!backup || typeof backup !== "object") {
    return { ok: false, error: "Backup JSON is empty or invalid." };
  }

  // Prefer embedded interview blueprint from enriched nuke exports.
  const embedded = backup.blueprint && typeof backup.blueprint === "object" ? backup.blueprint : null;
  const saved = savedBlueprint || embedded;

  let categoryEntries;
  if (Array.isArray(backup.categories)) {
    categoryEntries = backup.categories.map((cat) => [
      cat.name || "GENERAL",
      Array.isArray(cat.channels) ? cat.channels : []
    ]);
  } else if (backup.categories && typeof backup.categories === "object") {
    categoryEntries = Object.entries(backup.categories);
  } else if (saved?.categories) {
    categoryEntries = Object.entries(saved.categories);
  } else {
    return { ok: false, error: "Backup has no categories/channels to restore." };
  }

  const categories = {};
  let channelCount = 0;
  for (const [catName, channels] of categoryEntries) {
    const list = (Array.isArray(channels) ? channels : [])
      .map(sanitizeChannel)
      .filter(Boolean);
    if (!list.length && !catName) continue;
    categories[catName] = list;
    channelCount += list.length;
  }

  if (!Object.keys(categories).length) {
    return { ok: false, error: "Backup has no channels to restore." };
  }

  const msgIndex = messageIndexFromBlueprint(saved);
  let mergedMessages = 0;
  for (const list of Object.values(categories)) {
    for (const ch of list) {
      const hit = msgIndex.get(normalizeChannelKey(ch.name));
      if (!hit) continue;
      if (!ch.message && hit.message) {
        ch.message = structuredClone(hit.message);
        mergedMessages += 1;
      }
      if (hit.pinMessage && ch.pinMessage === undefined) ch.pinMessage = true;
      if (hit.permissionsPreset && !ch.permissionsPreset) {
        ch.permissionsPreset = hit.permissionsPreset;
      }
      if (hit.topic && !ch.topic) ch.topic = hit.topic;
    }
  }

  let roles = (backup.roles || saved?.roles || [])
    .map(sanitizeRole)
    .filter(Boolean);
  if (!roles.length) {
    roles = [
      { name: "Admin", permissions: ["Administrator"] },
      { name: "Moderator", permissions: ["ManageMessages", "EmbedLinks"] },
      { name: "Member" }
    ];
  }

  const blueprint = {
    name: backup.name || saved?.name,
    roles,
    categories,
    branding: backup.branding || saved?.branding,
    style: saved?.style || backup.style,
    tickets: saved?.tickets || backup.tickets,
    community: saved?.community ?? backup.community,
    lastPreset: saved?.lastPreset || backup.lastPreset,
    restoredFrom: "nuke-backup"
  };

  return {
    ok: true,
    blueprint,
    stats: {
      categoryCount: Object.keys(categories).length,
      channelCount,
      roleCount: roles.length,
      mergedMessages
    }
  };
}

/**
 * Latest on-disk nuke backup for a guild, if any.
 * @param {string} guildId
 * @returns {{ filePath: string, data: object } | null}
 */
export function loadLatestNukeBackup(guildId) {
  const dir = path.resolve("data", "backups");
  if (!fs.existsSync(dir)) return null;
  const prefix = `nuke-${guildId}-`;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort();
  if (!files.length) return null;
  const filePath = path.join(dir, files[files.length - 1]);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return { filePath, data };
  } catch {
    return null;
  }
}

/**
 * Build a restore blueprint for a guild from attachment JSON or latest on-disk nuke backup.
 * @param {string} guildId
 * @param {object|null} backupJson
 */
export function prepareRestoreBlueprint(guildId, backupJson = null) {
  const savedBlueprint = loadPersistedBlueprint(guildId);
  let source = "attachment";
  let backup = backupJson;

  if (!backup) {
    const latest = loadLatestNukeBackup(guildId);
    if (!latest) {
      return {
        ok: false,
        error:
          "No backup found. Attach the nuke JSON from your DMs, or run `/setup nuke` first (backup is saved before wipe)."
      };
    }
    backup = latest.data;
    source = path.basename(latest.filePath);
  }

  const converted = nukeBackupToBlueprint(backup, { savedBlueprint });
  if (!converted.ok) return converted;
  return { ...converted, source };
}
