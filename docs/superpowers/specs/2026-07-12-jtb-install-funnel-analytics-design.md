# JustTheBuilder Install→Build Funnel Analytics Design

**Date:** 2026-07-12  
**Status:** Approved  
**Repo:** `jmenichole/justthebuilder`  
**Companion:** Freemium `$0.99` branch (`feature/jtb-freemium-099`) — funnel hooks should land there or merge onto main after freemium merges.

## Summary

Instrument the post-install trail so ops `#bot-analytics-logs` shows **where owners drop off** after `guild_install`, and alert when a guild installs but never reaches a free **structure** apply within **24 hours**.

Today only install (and freemium polish/pack events) are visible — onboarding clicks, `/setup run`, interview completion, and “never built” are dark.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Surface | Existing ops analytics channel via `postAnalytics` |
| Depth | Step events **+** 24h stale-install alerts |
| Storage | Per-guild `funnel` object in `data/guilds/<id>.json` |
| Stale definition | `installedAt` ≥ 24h ago AND never reached `structure_applied` (or `polish_applied` / `full`) |
| Alert destination | Ops analytics only (no owner DM by default) |
| Deduping | `funnel.staleAlerted === true` after first stale post |
| Scope | JustTheBuilder only (not Royale/DAD in this spec) |

## Funnel steps

Ordered trail (each step updates `funnel.lastStep` / `funnel.lastStepAt` and posts analytics):

| Event | Trigger | Notes |
|-------|---------|--------|
| `guild_install` | `guildCreate` | Already exists; also set `funnel.installedAt` |
| `onboarding_dm_sent` | Owner DM succeeded | After `startOnboarding` |
| `onboarding_dm_failed` | Owner DM threw | Include error message truncated |
| `onboarding_start` | Button `jtb_start` | |
| `setup_run_started` | `/setup run` accepted | Include preset if any |
| `interview_completed` | Blueprint persisted + paywall shown | Freemium path |
| `structure_applied` | `applyBlueprint` mode `structure` | Already partially wired on freemium |
| `unlock_denied` | Unlock/polish without entitlement | |
| `polish_applied` / `pack_consumed` / `grandfather_used` | Existing freemium events | Keep; ensure funnel lastStep updates |

Optional (YAGNI unless cheap): `onboarding_help`, `onboarding_build_clicked` — only if one-line hooks.

**Embed fields (all step events):** Guild name + id, owner tag + id, step name, hours since `installedAt` when available.

## Architecture

```
guildCreate / buttons / setup / interview / applyBlueprint
  → recordFunnelStep(guildId, step, extra?)
       → patch guildConfig.funnel
       → postAnalytics({ event: step, ... })

bot ready
  → setInterval(scanStaleFunnels, 1h)
       → for each guild config with funnel.installedAt
            if age≥24h && !reachedStructure && !staleAlerted
              → postAnalytics stale_install (+ owner ping optional: OFF)
              → funnel.staleAlerted = true
```

### New helpers (suggested)

- `src/utils/funnel.js` — `recordFunnelStep`, `markStructureReached`, `scanStaleFunnels`, constants `STALE_MS = 24 * 60 * 60 * 1000`
- Call sites: `guildCreate.js`, `onboarding/flow.js`, `setup.js`, `interviewFlow.js` / paywall send, `applyBlueprint.js` (structure/polish already analytics — also update funnel)

### Guild config shape

```json
{
  "funnel": {
    "installedAt": "2026-07-12T17:00:00.000Z",
    "lastStep": "onboarding_start",
    "lastStepAt": "2026-07-12T17:05:00.000Z",
    "staleAlerted": false
  }
}
```

`reachedStructure` is implied by `lastStep` ∈ `{ structure_applied, polish_applied }` or by existing `structureAppliedAt` / `polishAppliedAt` fields from freemium — prefer checking **both** timestamps and lastStep so freemium and funnel stay consistent.

## Stale scan details

- Start interval on bot `ready` (same place as other boot hooks).
- Also run once ~60s after ready (catch backlog without waiting a full hour).
- Skip guilds where bot left (no guild in cache) — optional: still alert from config file if desired; **default: only guilds still in `client.guilds.cache`**.
- Color: warning orange for stale embeds.
- Title: `⏰ Stale install — no structure in 24h`.

## Error handling

- Funnel recording must be fire-and-forget: never throw into slash/button handlers (same as `postAnalytics`).
- If guild config write fails, still attempt analytics post.
- Stale scan errors: log via `logger` / `postError` only if scan itself crashes repeatedly — not per guild.

## Testing / success criteria

1. Fresh install → analytics shows install + `onboarding_dm_sent` (or failed).  
2. Click Start Setup → `onboarding_start`.  
3. `/setup run` → `setup_run_started` → interview complete → `interview_completed`.  
4. Apply free structure → `structure_applied`; stale scan never fires for that guild.  
5. Install with no further action: after 24h (or test with shortened `STALE_MS` in env `FUNNEL_STALE_MS`) → one `stale_install` alert, no duplicates on next scan.  
6. Ops channel remains readable (no spam beyond one event per step per action).

## Out of scope

- External analytics products (PostHog, etc.)  
- Per-question interview telemetry  
- Owner DMs for stale installs (default off)  
- Shared funnel for Royale / DAD  
- Niche bot product ideation (separate brainstorm/spec next)

## Approach note

**Approach 1 (selected):** Step events + guild `funnel` JSON + hourly 24h stale scan via existing ops analytics.
