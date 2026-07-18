import fs from "fs";
import path from "path";
import { log } from "./logger.js";

const baseDir = path.resolve("data", "users");

function fileFor(userId) {
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, `${userId}.json`);
}

function load(userId) {
  const file = fileFor(userId);
  if (!fs.existsSync(file)) return { polishCredits: 0 };
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    log(`userCredits parse failed for ${userId}: ${err.message}`);
    return { polishCredits: 0 };
  }
}

function save(userId, data) {
  fs.writeFileSync(fileFor(userId), JSON.stringify(data, null, 2));
}

export function getPolishCredits(userId) {
  return Number(load(userId).polishCredits) || 0;
}

export function addPolishCredits(userId, amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (!n) return getPolishCredits(userId);
  const data = load(userId);
  data.polishCredits = (Number(data.polishCredits) || 0) + n;
  save(userId, data);
  return data.polishCredits;
}

/** @returns {number} remaining credits */
export function consumePolishCredit(userId) {
  const data = load(userId);
  const current = Number(data.polishCredits) || 0;
  if (current < 1) return current;
  data.polishCredits = current - 1;
  save(userId, data);
  return data.polishCredits;
}
