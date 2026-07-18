# Slash `/help` + Helper Install Onboarding Design

**Date:** 2026-07-18  
**Status:** Approved  
**Repos:** `jmenichole/justthebuilder`, `jmenichole/justthehelper`  
**Phase:** 1 of 2 (discovery/onboarding). Phase 2 = payment friction (`/subscribe redeem`, auto-redeem on `/setup unlock`).

## Summary

Reduce “which command do I run first?” confusion for both bots by:

1. Adding **`/help`** on JustTheBuilder and JustTheHelper (ephemeral scenario-based reference).
2. Adding **JustTheHelper install onboarding DM** (owner + system-channel fallback), matching JustTheBuilder’s pattern.
3. Using **DM buttons as shortcuts** that reply with exact slash steps — not replacements for slash commands.

Shared footer on help/onboarding copy:

> _JustTheBuilder builds your server · JustTheHelper runs day-to-day support_

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Install DM recipient | **C** — server owner DM; system-channel fallback if DMs closed |
| Buttons vs slash | **Both** — buttons orient; slash executes (role pickers, etc.) |
| `/help` scope | Scenario sections, not full command encyclopedia |
| Builder `/setup` regroup | **Out of scope** (Phase 2 optional) |
| `/subscribe redeem` | **Out of scope** (Phase 2) |
| Helper Ko-fi product | Shop pass `https://ko-fi.com/s/014936eaac` (not membership API) |

## JustTheBuilder `/help`

**Command:** `/help` — no subcommands. Ephemeral reply.

**Sections (markdown):**

| Scenario | Commands |
|----------|----------|
| New server | `/setup run` |
| Bought on Ko-fi | `/setup redeem` → `/setup unlock` |
| Fix empty embeds | `/setup post-messages` (after unlock) |
| Ticket category menu | `/setup ticket-panel` (after unlock) |
| Start over | `/setup nuke` then `/setup run` |
| Companion bot | Link to JustTheHelper invite (`1525974622875422831`) |

**DRY:** Extract copy to `src/config/help.js` (or `src/utils/help/copy.js`). `jtb_help` button uses same builder function as `/help`.

## JustTheHelper `/help`

**Command:** `/help` — no subcommands. Ephemeral reply.

**Sections:**

| Scenario | Commands |
|----------|----------|
| Free — welcome | `/welcome set-role` → `/welcome post` |
| Free — reminders | `/remind when:… text:…` |
| Unlock tickets | `/subscribe info` → Ko-fi shop → `/subscribe status` |
| Run tickets | `/tickets setup` → `/tickets panel` |
| Companion | One line: paired with JustTheBuilder |

Shop URL from `KOFI_PAGE_URL` env when set; else generic “run `/subscribe info`”.

## JustTheHelper install onboarding

**Trigger:** `guildCreate` in `src/utils/events/guildCreate.js`.

**Flow:**

```
guildCreate
  → postGuildInstall (ops analytics) — keep existing
  → fetchOwner()
  → startHelperOnboarding(owner, guild, client)
       → try DM with buttons
       → on failure: guild.systemChannel?.send(fallback)
```

**DM body (short):**

- Greeting + one-line value prop
- Free path: welcome + remind
- Paid path: subscribe info + guild pass
- “Run `/help` anytime”

**Buttons (customIds):**

| Button | customId | On click |
|--------|----------|----------|
| Setup welcome | `jth_help_welcome` | Ephemeral reply: set-role → post steps |
| Unlock tickets | `jth_help_subscribe` | Ephemeral reply: subscribe info + shop |
| Command list | `jth_help_commands` | Same text as `/help` |

Handler lives in `src/utils/onboarding/flow.js` (new) or `src/utils/onboarding/handler.js`; wire in `bot.js` `interactionCreate` for button components.

## Error handling

| Case | Behavior |
|------|----------|
| DM closed | System channel message; log once |
| No system channel | Log only; ops install event still fires |
| `/help` outside guild (Helper billing cmds need guild) | `/help` works in guild; DM button replies are ephemeral in DM context if applicable |

## Testing

| Repo | Tests |
|------|-------|
| justthebuilder | Unit test `buildHelpMessage()` includes key scenarios + Helper invite when enabled |
| justthehelper | Unit test `buildHelpMessage()` + onboarding copy includes `/subscribe info` |

**Manual smoke:**

1. Re-invite Helper to test guild → owner DM (or system fallback).
2. Click each DM button → correct slash hints.
3. `/help` on both bots in test guild → ephemeral, matches DM hints.
4. Builder `jtb_help` button text matches `/help` core section.

## Out of scope (Phase 2)

- `/subscribe redeem` (Ko-fi transaction ID)
- `/setup unlock` auto-redeem
- README / Ko-fi copy drift cleanup (separate doc pass)
- Builder `/setup` subcommand groups
- Public payment display / `is_public` webhook field

## Files (expected touch)

**justthebuilder**

- `src/config/help.js` (new)
- `src/config/help.test.js` (new)
- `src/utils/commands/help.js` (new)
- `src/utils/bot.js` — register `/help`, route handler
- `src/utils/onboarding/flow.js` — `jtb_help` uses shared copy

**justthehelper**

- `src/config/help.js` (new)
- `src/config/help.test.js` (new)
- `src/utils/commands/help.js` (new)
- `src/utils/onboarding/flow.js` (new)
- `src/utils/events/guildCreate.js` — call onboarding
- `src/utils/bot.js` — register `/help`, button routing

## Success criteria

- New Helper install receives orientation within 5 seconds (DM or fallback).
- `/help` answers all Phase 1 scenarios without reading README.
- Install DM buttons and `/help` do not contradict Ko-fi shop copy (`JTH-` vs `JTB-` flows stay separate).
