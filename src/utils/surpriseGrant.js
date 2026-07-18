import fs from "fs";
import path from "path";
import { loadPersistedBlueprint } from "./applyBlueprint.js";
import { guildHasPolishApplied } from "./entitlements.js";
import { grantManualPolishGrant } from "./grandfather.js";
import { loadGuildConfig, saveGuildConfig } from "./storage/guildConfig.js";

const STATE_PATH = path.resolve("data", "surprise_grant.json");

/**
 * @returns {{ enabled: boolean, everyN: number, mode: "random"|"nth" }}
 */
export function surpriseGrantConfig() {
  const everyN = Math.max(2, parseInt(process.env.SURPRISE_GRANT_EVERY_N || "12", 10) || 12);
  const mode = String(process.env.SURPRISE_GRANT_MODE || "random").toLowerCase() === "nth" ? "nth" : "random";
  return {
    enabled: process.env.SURPRISE_GRANT_ENABLED !== "false",
    everyN,
    mode
  };
}

/**
 * @returns {{ totalEligibleInstalls: number, grantsAwarded: number, installsSinceLastGrant: number, lastGrantAt?: number }}
 */
export function loadSurpriseGrantState() {
  if (!fs.existsSync(STATE_PATH)) {
    return { totalEligibleInstalls: 0, grantsAwarded: 0, installsSinceLastGrant: 0 };
  }
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
    return {
      totalEligibleInstalls: Number(data.totalEligibleInstalls) || 0,
      grantsAwarded: Number(data.grantsAwarded) || 0,
      installsSinceLastGrant: Number(data.installsSinceLastGrant) || 0,
      lastGrantAt: data.lastGrantAt
    };
  } catch {
    return { totalEligibleInstalls: 0, grantsAwarded: 0, installsSinceLastGrant: 0 };
  }
}

/** @param {object} state */
export function saveSurpriseGrantState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * @param {string} guildId
 */
export function guildAlreadyRewarded(guildId) {
  const cfg = loadGuildConfig(guildId);
  return Boolean(cfg.surpriseGrantAt || cfg.manualPolishGrant);
}

/**
 * Pure lottery step (unit-testable).
 * @param {{ state: object, everyN: number, mode: "random"|"nth", randomFn?: () => number }} opts
 */
export function evaluateSurpriseGrant({ state, everyN, mode, randomFn = Math.random }) {
  const next = {
    ...state,
    totalEligibleInstalls: (state.totalEligibleInstalls || 0) + 1,
    installsSinceLastGrant: (state.installsSinceLastGrant || 0) + 1
  };

  let won = false;
  if (mode === "nth") {
    won = next.totalEligibleInstalls % everyN === 0;
  } else {
    won = randomFn() < 1 / everyN || next.installsSinceLastGrant >= everyN;
  }

  if (won) {
    next.grantsAwarded = (next.grantsAwarded || 0) + 1;
    next.installsSinceLastGrant = 0;
    next.lastGrantAt = Date.now();
  }

  return { won, state: next };
}

/**
 * Maybe award a free full unlock on guild install (~1 per everyN installs).
 * @param {import('discord.js').Guild} guild
 * @param {{ randomFn?: () => number }} [opts]
 */
export function trySurpriseGrantForGuild(guild, opts = {}) {
  const config = surpriseGrantConfig();
  if (!config.enabled) return { awarded: false, reason: "disabled" };

  if (guildHasPolishApplied(guild.id) || guildAlreadyRewarded(guild.id)) {
    return { awarded: false, reason: "ineligible" };
  }

  const state = loadSurpriseGrantState();
  const { won, state: newState } = evaluateSurpriseGrant({
    state,
    everyN: config.everyN,
    mode: config.mode,
    randomFn: opts.randomFn
  });
  saveSurpriseGrantState(newState);

  if (!won) {
    return {
      awarded: false,
      reason: "no_win",
      installNumber: newState.totalEligibleInstalls
    };
  }

  grantManualPolishGrant(guild.id);
  const cfg = loadGuildConfig(guild.id);
  saveGuildConfig(guild.id, { ...cfg, surpriseGrantAt: Date.now() });

  return {
    awarded: true,
    installNumber: newState.totalEligibleInstalls,
    grantsAwarded: newState.grantsAwarded,
    hasBlueprint: Boolean(loadPersistedBlueprint(guild.id))
  };
}
