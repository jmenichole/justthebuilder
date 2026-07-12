# JustTheBuilder Install→Build Funnel Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument post-install funnel steps into ops analytics and alert when a guild never reaches structure apply within 24 hours.

**Architecture:** Add `src/utils/funnel.js` (`recordFunnelStep`, `scanStaleFunnels`); patch guild config `funnel` object; wire call sites on freemium branch; start hourly + delayed stale scan on bot ready.

**Tech Stack:** Node.js ESM, discord.js v14, existing `postAnalytics` / `data/guilds/*.json`, Fly `justthebuilder`.

**Spec:** `docs/superpowers/specs/2026-07-12-jtb-install-funnel-analytics-design.md`

**Working directory:** Prefer `justthebuilder/.worktrees/jtb-freemium` on `feature/jtb-freemium-099` (has structure/polish modes). Cherry-pick funnel spec commit onto that branch if missing, or implement after freemium merges to main.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/utils/funnel.js` | recordFunnelStep, hasReachedStructure, scanStaleFunnels, startFunnelScanner |
| `src/utils/funnel.test.js` | Unit tests for reached/stale logic |
| `src/utils/events/guildCreate.js` | installedAt + dm sent/failed |
| `src/utils/onboarding/flow.js` | onboarding_start |
| `src/utils/commands/setup.js` | setup_run_started, interview_completed (via paywall), unlock_denied |
| `src/utils/applyBlueprint.js` | sync funnel on structure/polish apply |
| `src/utils/bot.js` | startFunnelScanner on ready |
| `src/config/env.example` | `FUNNEL_STALE_MS` optional |

---

### Task 1: `funnel.js` core + tests

**Files:**
- Create: `src/utils/funnel.js`
- Create: `src/utils/funnel.test.js`

- [ ] **Step 1: Implement `funnel.js`**

```javascript
import { loadGuildConfig, saveGuildConfig } from "./storage/guildConfig.js";
import { postAnalytics } from "./ops.js";
import { log } from "./logger.js";
import fs from "fs";
import path from "path";

export const DEFAULT_STALE_MS = 24 * 60 * 60 * 1000;
export const STRUCTURE_STEPS = new Set(["structure_applied", "polish_applied"]);

export function staleMs() {
  const raw = process.env.FUNNEL_STALE_MS;
  if (raw && Number.isFinite(Number(raw)) && Number(raw) > 0) return Number(raw);
  return DEFAULT_STALE_MS;
}

export function hasReachedStructure(cfg = {}) {
  if (cfg.structureAppliedAt || cfg.polishAppliedAt) return true;
  const step = cfg.funnel?.lastStep;
  return STRUCTURE_STEPS.has(step);
}

export function hoursSinceInstall(funnel) {
  if (!funnel?.installedAt) return null;
  const t = Date.parse(funnel.installedAt);
  if (!Number.isFinite(t)) return null;
  return ((Date.now() - t) / 3600000).toFixed(1);
}

/**
 * Fire-and-forget funnel step. Never throws to callers.
 * @param {import('discord.js').Guild|null} guild
 * @param {string} step
 * @param {{ owner?: import('discord.js').User, fields?: object[], title?: string, description?: string, color?: number }} [extra]
 */
export function recordFunnelStep(guild, step, extra = {}) {
  try {
    const guildId = guild?.id || extra.guildId;
    if (!guildId || !step) return;

    const cfg = loadGuildConfig(guildId);
    const now = new Date().toISOString();
    const funnel = { ...(cfg.funnel || {}) };
    if (step === "guild_install" && !funnel.installedAt) {
      funnel.installedAt = now;
    }
    if (!funnel.installedAt && guild) {
      // backfill if somehow missing
      funnel.installedAt = funnel.installedAt || now;
    }
    funnel.lastStep = step;
    funnel.lastStepAt = now;
    saveGuildConfig(guildId, { ...cfg, funnel });

    const hrs = hoursSinceInstall(funnel);
    const fields = [
      guild ? { name: "Guild", value: `${guild.name}\n\`${guild.id}\``, inline: true } : { name: "Guild", value: `\`${guildId}\``, inline: true },
      extra.owner
        ? { name: "Owner", value: `${extra.owner.tag || extra.owner.username} (<@${extra.owner.id}>)`, inline: true }
        : null,
      { name: "Step", value: `\`${step}\``, inline: true },
      hrs != null ? { name: "Hours since install", value: String(hrs), inline: true } : null,
      ...(extra.fields || []),
    ];

    postAnalytics({
      event: step,
      title: extra.title || `📊 Funnel · ${step}`,
      description: extra.description || null,
      color: extra.color,
      fields,
    });
  } catch (err) {
    log(`[funnel] recordFunnelStep failed: ${err.message}`);
  }
}

export function scanStaleFunnels(client) {
  try {
    const dir = path.resolve("data", "guilds");
    if (!fs.existsSync(dir)) return;
    const threshold = staleMs();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const guildId = file.replace(/\.json$/, "");
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      const cfg = loadGuildConfig(guildId);
      const funnel = cfg.funnel || {};
      if (!funnel.installedAt || funnel.staleAlerted) continue;
      if (hasReachedStructure(cfg)) continue;
      const installed = Date.parse(funnel.installedAt);
      if (!Number.isFinite(installed)) continue;
      if (Date.now() - installed < threshold) continue;

      postAnalytics({
        event: "stale_install",
        title: "⏰ Stale install — no structure in 24h",
        description: `**${guild.name}** never reached free structure.`,
        color: 0xe67e22,
        fields: [
          { name: "Guild", value: `\`${guild.id}\``, inline: true },
          { name: "Last step", value: `\`${funnel.lastStep || "none"}\``, inline: true },
          { name: "Installed", value: funnel.installedAt, inline: false },
        ],
      });
      saveGuildConfig(guildId, {
        ...cfg,
        funnel: { ...funnel, staleAlerted: true },
      });
    }
  } catch (err) {
    log(`[funnel] scanStaleFunnels failed: ${err.message}`);
  }
}

export function startFunnelScanner(client) {
  const hour = 60 * 60 * 1000;
  setTimeout(() => scanStaleFunnels(client), 60_000);
  setInterval(() => scanStaleFunnels(client), hour);
  log("[funnel] stale scanner scheduled (1h interval, first run ~60s)");
}
```

- [ ] **Step 2: Tests** (`funnel.test.js`)

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasReachedStructure, STRUCTURE_STEPS } from "./funnel.js";

describe("hasReachedStructure", () => {
  it("true when structureAppliedAt set", () => {
    assert.equal(hasReachedStructure({ structureAppliedAt: "2026-01-01" }), true);
  });
  it("true when lastStep is polish_applied", () => {
    assert.equal(hasReachedStructure({ funnel: { lastStep: "polish_applied" } }), true);
  });
  it("false when only install", () => {
    assert.equal(hasReachedStructure({ funnel: { lastStep: "guild_install" } }), false);
  });
  it("STRUCTURE_STEPS includes structure_applied", () => {
    assert.equal(STRUCTURE_STEPS.has("structure_applied"), true);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
node --test src/utils/funnel.test.js
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/utils/funnel.js src/utils/funnel.test.js
git commit -m "feat: add funnel step recorder and stale install scanner"
```

---

### Task 2: Wire install + onboarding + setup call sites

**Files:**
- Modify: `src/utils/events/guildCreate.js`
- Modify: `src/utils/onboarding/flow.js`
- Modify: `src/utils/commands/setup.js`
- Modify: `src/utils/applyBlueprint.js` (funnel sync on structure/polish)
- Modify: `src/utils/bot.js`
- Modify: `src/config/env.example`

- [ ] **Step 1: `guildCreate.js`**

After `postGuildInstall(guild)`:

```javascript
import { recordFunnelStep } from "../funnel.js";
// ...
recordFunnelStep(guild, "guild_install", { owner: owner.user, title: "🟢 Bot added to server" });
```

Note: `postGuildInstall` already posts analytics — either:
- **A)** Keep `postGuildInstall` and make `recordFunnelStep` for `guild_install` **skip duplicate postAnalytics** when `extra.skipPost`, only write config, OR
- **B)** Replace `postGuildInstall` with `recordFunnelStep` that posts the same install embed.

Prefer **B** for one embed: change `handleGuildCreate` to call `recordFunnelStep` with install title/color and **remove** separate `postGuildInstall` call (or make `postGuildInstall` call `recordFunnelStep` internally).

Simplest: update `postGuildInstall` in `ops.js` to also set funnel installedAt via importing record — avoid circular deps. Better: in guildCreate:

```javascript
recordFunnelStep(guild, "guild_install", {
  owner: owner.user,
  title: "🟢 Bot added to server",
  color: 0x2ecc71,
  fields: [{ name: "Members", value: String(guild.memberCount ?? "?"), inline: true }],
  skipDefaultTitle: true,
});
// Remove postGuildInstall(guild) to avoid double post
```

And wrap try/catch for DM:

```javascript
try {
  await startOnboarding(owner.user, guild, client);
  recordFunnelStep(guild, "onboarding_dm_sent", { owner: owner.user });
} catch (err) {
  recordFunnelStep(guild, "onboarding_dm_failed", {
    owner: owner.user,
    description: err.message,
  });
  // existing systemChannel fallback
}
```

Restructure current catch so install still records when DM fails.

- [ ] **Step 2: `onboarding/flow.js` — `jtb_start`**

```javascript
import { recordFunnelStep } from "../funnel.js";
// in jtb_start handler:
const g = client.guilds.cache.get(state.guildId);
recordFunnelStep(g, "onboarding_start", { owner: user });
```

- [ ] **Step 3: `setup.js`**

On `/setup run` after cooldowns pass:

```javascript
recordFunnelStep(interaction.guild, "setup_run_started", {
  owner: interaction.user,
  fields: preset ? [{ name: "Preset", value: preset, inline: true }] : [],
});
```

After successful interview + `sendFreemiumPaywall`:

```javascript
recordFunnelStep(interaction.guild, "interview_completed", { owner: interaction.user });
```

In `applyPolishForInteraction` when `!access.allowed`:

```javascript
recordFunnelStep(guild, "unlock_denied", { owner: ownerUser || interaction.user });
```

- [ ] **Step 4: `applyBlueprint.js`**

Where you already `postAnalytics` for structure/polish, also:

```javascript
import { recordFunnelStep } from "./funnel.js";
// After successful apply, instead of duplicating analytics:
recordFunnelStep(guild, mode === "structure" ? "structure_applied" : "polish_applied", {
  owner: ownerUser,
  title: mode === "structure" ? "Free structure applied" : "Polish applied",
});
```

If `postAnalytics` for those events already exists, remove the duplicate `postAnalytics` call and let `recordFunnelStep` own the post (or pass `extra.skipAnalytics` — prefer single post via recordFunnelStep only).

- [ ] **Step 5: `bot.js` ready path**

After `initOps(client)`:

```javascript
const { startFunnelScanner } = await import("./funnel.js");
startFunnelScanner(client);
```

- [ ] **Step 6: `env.example`**

```bash
# Optional: override stale install window (ms). Default 24h.
# FUNNEL_STALE_MS=86400000
```

- [ ] **Step 7: Verify**

```bash
node --check src/utils/funnel.js
node --test src/utils/funnel.test.js
```

- [ ] **Step 8: Commit**

```bash
git add src/utils/funnel.js src/utils/events/guildCreate.js src/utils/onboarding/flow.js src/utils/commands/setup.js src/utils/applyBlueprint.js src/utils/bot.js src/config/env.example
git commit -m "feat: wire install-to-build funnel analytics and stale alerts"
```

---

### Task 3: Deploy + smoke

- [ ] **Step 1: Push branch + deploy**

```bash
git push -u origin HEAD
flyctl deploy -a justthebuilder --ha=false
curl -s https://justthebuilder.fly.dev/health
```

Expected: `{"status":"ok",...}`

- [ ] **Step 2: Manual smoke**

1. Add bot to test guild → `#bot-analytics-logs` shows install + `onboarding_dm_sent` (or failed).  
2. Click Start Setup → `onboarding_start`.  
3. `/setup run` → `setup_run_started` → finish interview → `interview_completed`.  
4. Apply structure → `structure_applied`.  
5. Optional: set `FUNNEL_STALE_MS=60000` on Fly secret, install without building, wait ~2 min → `stale_install` once.

- [ ] **Step 3: Done** — document smoke results in PR body if opening PR.

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Step events | 1–2 |
| Guild funnel JSON | 1–2 |
| 24h stale scan | 1, 2 (bot.js) |
| Ops-only alerts | 1 |
| No owner DM | 1 (no DM code) |
| Freemium compatibility | 2 (applyBlueprint) |

## Out of scope

External dashboards, per-question telemetry, Royale/DAD funnels, niche bot ideation.
