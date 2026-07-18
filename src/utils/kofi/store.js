import fs from "fs";
import path from "path";
import crypto from "crypto";
import { log } from "../logger.js";

const baseDir = path.resolve("data", "kofi");
const codesFile = path.join(baseDir, "codes.json");

function ensureDir() {
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
}

function loadAll() {
  ensureDir();
  if (!fs.existsSync(codesFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(codesFile, "utf-8"));
  } catch (err) {
    log(`kofi store parse failed: ${err.message}`);
    return {};
  }
}

function saveAll(data) {
  ensureDir();
  fs.writeFileSync(codesFile, JSON.stringify(data, null, 2));
}

/** @returns {string} e.g. JTB-A1B2C3 */
export function generateRedeemCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) suffix += chars[bytes[i] % chars.length];
  return `JTB-${suffix}`;
}

/**
 * @param {object} order
 * @param {string} order.kofiTransactionId
 * @param {string} order.messageId
 * @param {string} [order.email]
 * @param {string} [order.fromName]
 * @param {string} [order.amount]
 * @param {string} [order.currency]
 * @param {string} [order.discordUserId]
 */
export function createCodeForOrder(order) {
  const all = loadAll();
  const existing = Object.values(all).find(
    (e) =>
      e.kofiTransactionId === order.kofiTransactionId ||
      (order.messageId && e.messageId === order.messageId)
  );
  if (existing) return existing;

  let code = generateRedeemCode();
  while (all[code]) code = generateRedeemCode();

  const entry = {
    code,
    kofiTransactionId: order.kofiTransactionId,
    messageId: order.messageId || null,
    email: order.email || null,
    fromName: order.fromName || null,
    amount: order.amount || null,
    currency: order.currency || null,
    discordUserId: order.discordUserId || null,
    createdAt: new Date().toISOString(),
    redeemedAt: null,
    redeemedByUserId: null,
    redeemedGuildId: null,
    status: "pending"
  };
  all[code] = entry;
  all[`tx:${order.kofiTransactionId}`] = { ref: code };
  saveAll(all);
  return entry;
}

/**
 * @param {string} raw User input (JTB-XXXXXX or Ko-fi transaction id)
 */
export function findCodeEntry(raw) {
  const input = String(raw || "").trim();
  if (!input) return null;
  const all = loadAll();

  const upper = input.toUpperCase();
  if (all[upper]?.code) return all[upper];
  if (all[upper]) return all[upper];

  const txKey = input.startsWith("tx:") ? input : `tx:${input}`;
  const ref = all[txKey]?.ref;
  if (ref && all[ref]) return all[ref];

  return (
    Object.values(all).find(
      (e) =>
        e &&
        typeof e === "object" &&
        e.code &&
        (e.kofiTransactionId === input || e.code === upper)
    ) || null
  );
}

/**
 * @param {string} code
 * @param {{ userId: string, guildId: string }} redeemer
 */
export function markCodeRedeemed(code, redeemer) {
  const all = loadAll();
  const entry = all[code];
  if (!entry || entry.status !== "pending") return null;
  entry.status = "redeemed";
  entry.redeemedAt = new Date().toISOString();
  entry.redeemedByUserId = redeemer.userId;
  entry.redeemedGuildId = redeemer.guildId;
  all[code] = entry;
  saveAll(all);
  return entry;
}
