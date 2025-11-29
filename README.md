# JustTheBuilder

AI-powered Discord bot that interviews the server owner, generates a validated JSON blueprint, and builds an entire server structure (roles, categories, channels, permissions, embeds, community features) automatically.

## Key Features
- Owner DM interview → Few-shot AI → Self-healed JSON blueprint
- Ajv schema validation with repair attempts
- Automated roles, categories, channels with emoji/theme formatting
- Advanced permission presets (public-readonly, staff-private, mods-only, announcement-lock)
- Category privacy inheritance + per-channel overrides
- Channel ordering + forum channels + voice + announcement + media types
- Thread locking & auto-archive durations (forum)
- Styled info embeds (Welcome, Rules, About, FAQ) with gold theme
- Community / welcome screen scaffolding
- `/setup` slash command with cooldowns & reset confirmation
- Progress DMs + build summary metrics
- Simulation harness (offline test) & example blueprint
- Persistent blueprint storage (reapply / export / rollback)
- Interactive onboarding (buttons + select menus)
- Webhook auto-creation for announcement/media channels
 - Branding system (emoji + color applied to embeds & channel names)
 - Template packs (default, gaming, crypto, streamer, degen)
 - Usage logging (append-only metrics per build)
 - Guild config caching (stores last blueprint & metrics)
 - Additional slash subcommands: export / import / reapply / preview
 - Save blueprint as custom template (`/setup save-template <name>`) for reuse

## Quick Start
```bash
pnpm install
cp src/config/env.example .env
pnpm start
```

Invite the bot to a server; it will DM the owner and guide setup.

## Environment Variables
| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Discord bot token |
| `AI_GATEWAY_URL` | AI Gateway / OpenAI endpoint URL |
| `AI_GATEWAY_KEY` / `AI_GATEWAY_API_KEY` / `OPEN_AI_API_KEY` | One of these will be used as the AI bearer key (fallback order) |
| `DEBUG` | Set to `1` to enable debug logs |
### Privileged Gateway Intents
If you see `Used disallowed intents`:
1. Go to Discord Developer Portal → Application → Bot.
2. Enable toggles for: SERVER MEMBERS INTENT and MESSAGE CONTENT INTENT.
3. Save changes. Wait ~1 minute and restart the bot.
4. If you do not need DM freeform answers, you can remove `MessageContent` intent from `utils/bot.js` to avoid the requirement.


## Scripts
```bash
pnpm dev        # Run with nodemon
pnpm simulate   # Offline simulation using blueprint.example.json
pnpm dry-run    # Validate & summarize any blueprint JSON (no mock guild)
```

## Project Structure (Key Files)
```
src/
	bot.js                   # Entry wrapper
	utils/bot.js             # Client init & command registration
	utils/ai/interviewFlow.js# Interview + AI generation + build
	utils/ai/schemas.js      # Ajv schema & validation helpers
	utils/ai/gateway.js      # AI request wrapper w/ retry
	utils/applyBlueprint.js  # Orchestrates build (progress + metrics)
	utils/builder/           # Channels, messages, permissions, embeds
	utils/commands/setup.js  # /setup run/reset + cooldowns
	utils/progress.js        # sendProgress helper
```

## Contributing Guide
1. Fork / branch from `main`.
2. Run `pnpm install` and `pnpm simulate` to ensure baseline passes.
3. For new blueprint fields, update `schemas.js` and add few-shot example if needed.
4. Maintain JSDoc for all public functions.
5. Run `pnpm simulate` after changes to verify no structural regressions.
6. Open a PR with a clear summary + test blueprint diff.

### Code Style
- ES Modules, async/await for all async flows.
- Minimal side effects; builder functions return maps/metrics.
- Use `log()/warn()/error()/debug()` for diagnostics.
- Avoid hardcoding permission constants outside `permissions.js`.

## Testing (Simulation Harness)
`pnpm simulate` loads `blueprint.example.json`, mocks Discord guild objects, and runs the build pipeline. It prints role/channel counts & metrics—use this before live testing.
`pnpm dry-run` performs quick schema validation & counts via `scripts/runLocalBlueprint.js` without constructing mock guild objects.

## AI Prompt Template
See `src/utils/ai/promptTemplate.md` for the canonical generation instructions used to shape the JSON blueprint.

## Rerunning Setup
Use `/setup run` (subject to cooldown). To wipe channels (dangerous) use `/setup reset` and follow confirmation instructions.

## Interactive Onboarding Flow
1. Bot joins → DM with Start/Help/Advanced buttons.
2. Step-wise selects for server type, style, sections.
3. Yes/No buttons for rules/about/FAQ & private channels.
4. Role input (comma list) auto-infers colors & permission presets.
5. Preview of blueprint with build confirmation buttons.
6. Live progress DMs (roles, categories, channels, permissions, messages, finalize).
7. Completion buttons: export template, reapply, branding (future), automations (future).
8. Post-build message in a general channel advertising rerun command.

## Persistence & Export
Built blueprints saved under `data/blueprints/<guildId>.json`. Latest preview stored for quick export/reapply.
`data/guilds/<guildId>.json` caches last blueprint, metrics, and timestamps (supports multi-server scaling).

Slash command lifecycle:
- `/setup export` → Serialize current guild (roles, categories, channel names/types, webhooks) → DM JSON file.
- `/setup import` → Validate attached blueprint JSON via schema → Store without building.
- `/setup reapply` → Build using last stored/imported blueprint (skips interview).
- `/setup preview` → DM stored blueprint for inspection.
 - `/setup save-template <name>` → Persist last stored blueprint to `templates/<name>.json` for future reuse or sharing.

## Rollback Strategy (Future)
Current rollback deletes channels then reapplies last stored blueprint. Full differential rollback planned (track created IDs).

## Future Improvements
- Differential rollback (track IDs for precise restoration)
- Premium automation suite (branding, scheduled posts, smart analytics)
- Database persistence (PostgreSQL/SQLite instead of JSON files)
- Unit + integration tests (Vitest/Jest with discord.js mocks)
- Dynamic style packs & theme expansion
 - Deeper export fidelity (permission overwrites, topics, slowmode, NSFW flags)
 - Selective apply/diff (only create missing artifacts)
 - Metrics dashboard & anomaly alerts

---
Made with 💸 neon-gold energy.
# justthebuilder
