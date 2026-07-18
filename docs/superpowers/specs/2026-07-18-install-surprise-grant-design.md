# Install Surprise Grant Design

**Date:** 2026-07-18  
**Status:** Approved  
**Repos:** `jmenichole/justthebuilder`, `jmenichole/justthehelper`

## Summary

Reward roughly **1 in every N new guild installs** with a surprise free upgrade to encourage testing, word-of-mouth, and growth — without manual `/grant` from the owner.

## Decisions

| Decision | Choice |
|----------|--------|
| Builder prize | Free full unlock (`manualPolishGrant` → `/setup unlock`) |
| Helper prize | Free 31-day guild pass (`extendGuildSubscription`) |
| Default interval | **12** eligible installs (`SURPRISE_GRANT_EVERY_N`) |
| Default mode | **random** — `1/N` chance per install, guaranteed by install N if no winner yet |
| Alt mode | **nth** — exactly every Nth eligible install wins |
| Eligibility | New install, no prior surprise, no existing manual grant, not already unlocked |
| Re-adds | Same guild skips if already rewarded |
| Kill switch | `SURPRISE_GRANT_ENABLED=false` |

## Flow

```
guildCreate
  → postGuildInstall (analytics)
  → trySurpriseGrantForGuild(guild)
       → ineligible? skip
       → increment global counter
       → lottery (random or nth)
       → on win: grant + surpriseGrantAt + owner DM + ops event
  → normal install onboarding DM (/help buttons)
```

## Owner DM (Builder)

- Surprise headline + growth/testing framing
- Smart next step: `/setup unlock` if interview saved, else `/setup run` → `/setup unlock`
- Points to `/help`

## Owner DM (Helper)

- Surprise 31-day guild pass
- `/tickets setup` → `/tickets panel`, `/subscribe status`
- Points to `/help`

## Config (env)

| Variable | Default | Meaning |
|----------|---------|---------|
| `SURPRISE_GRANT_ENABLED` | `true` | Master switch (`false` disables) |
| `SURPRISE_GRANT_EVERY_N` | `12` | Target interval (~1 winner per N installs) |
| `SURPRISE_GRANT_MODE` | `random` | `random` or `nth` |

## Persistence

- `data/surprise_grant.json` — global counters per bot app
- Guild config `surpriseGrantAt` — prevents double-award on re-invite

## Analytics

- Event: `surprise_grant` in ops channel (install #, total grants, guild)

## Out of scope

- Public odds disclosure in `/help` (keeps surprise feel)
- Cross-bot linked lottery (separate counters per app)
- User-install lottery (guild install only)

## Success criteria

- ~1 surprise per 12 eligible installs (statistical over time)
- Winner can unlock without paying or owner `/grant`
- No double-awards on re-invite
- Ops channel shows surprise events for monitoring
