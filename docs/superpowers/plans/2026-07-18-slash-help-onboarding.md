# Slash `/help` + Helper Install Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/help` to both bots and Helper install onboarding DM (owner + system-channel fallback) so new admins know which slash commands to run first.

**Architecture:** Shared help-copy modules per repo build markdown strings; slash handlers return ephemeral replies; Helper `guildCreate` DMs owner with buttons that echo the same copy (no auto-execution of guild commands). Builder `jtb_help` reuses Builder help copy.

**Tech Stack:** Node.js ESM, discord.js v14, `node:test`, Fly.io deploy (two repos).

## Global Constraints

- Phase 1 only — no `/subscribe redeem`, no `/setup` regroup, no payment logic changes.
- Buttons **hint** slash commands; do not replace role pickers or guild-only flows.
- Helper install DM: owner first; `guild.systemChannel` fallback if DM fails (option C).
- Footer verbatim: `_JustTheBuilder builds your server · JustTheHelper runs day-to-day support_`
- JustTheHelper invite client ID: `1525974622875422831` (from `marketing.js` default or env).
- Ko-fi Helper shop URL from `KOFI_PAGE_URL` when set (`https://ko-fi.com/s/014936eaac` in prod).
- Match existing command registration patterns in each `bot.js`.
- Do not mention `/subscribe` or `JTH-` in Builder help; do not mention `/setup` or `JTB-` in Helper help.

---

## File map

| Repo | Create | Modify |
|------|--------|--------|
| justthebuilder | `src/config/help.js`, `src/config/help.test.js`, `src/utils/commands/help.js` | `src/utils/bot.js`, `src/utils/onboarding/flow.js` |
| justthehelper | `src/config/help.js`, `src/config/help.test.js`, `src/utils/commands/help.js`, `src/utils/onboarding/flow.js` | `src/utils/bot.js`, `src/utils/events/guildCreate.js` |

---

### Task 1: JustTheBuilder help copy module

**Files:**
- Create: `src/config/help.js`
- Create: `src/config/help.test.js`
- Modify: `src/config/marketing.js` (import invite helper only if needed — prefer import `getJustTheHelperInviteUrl` from existing `marketing.js`)

**Interfaces:**
- Produces: `export function buildHelpMessage()` → `string` (markdown, ≤2000 chars)

- [ ] **Step 1: Write the failing test**

```javascript
// src/config/help.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHelpMessage } from "./help.js";

describe("buildHelpMessage", () => {
  it("includes core setup scenarios", () => {
    const text = buildHelpMessage();
    assert.match(text, /\/setup run/);
    assert.match(text, /\/setup redeem/);
    assert.match(text, /\/setup unlock/);
    assert.match(text, /JustTheHelper/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test src/config/help.test.js
```
Expected: FAIL — cannot find module `./help.js`

- [ ] **Step 3: Implement `src/config/help.js`**

```javascript
import { TAGLINE, getJustTheHelperInviteUrl } from "./marketing.js";

export function buildHelpMessage() {
  const helperInvite = getJustTheHelperInviteUrl();
  const helperLine = helperInvite
    ? `[JustTheHelper](${helperInvite}) — welcome, reminders & tickets`
    : "JustTheHelper — welcome, reminders & tickets";

  return [
    "**JustTheBuilder — command guide**",
    `_${TAGLINE}_`,
    "",
    "🚀 **New server** → `/setup run`",
    "💎 **Bought on Ko-fi** → `/setup redeem` then `/setup unlock`",
    "📝 **Fix empty embeds** → `/setup post-messages` _(after unlock)_",
    "🎫 **Ticket menu** → `/setup ticket-panel` _(after unlock)_",
    "☢️ **Start over** → `/setup nuke` then `/setup run`",
    "",
    `🎫 **Day-to-day support** → ${helperLine}`,
    "",
    "_JustTheBuilder builds your server · JustTheHelper runs day-to-day support_"
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test src/config/help.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/help.js src/config/help.test.js
git commit -m "feat(help): add JustTheBuilder help copy module"
```

---

### Task 2: JustTheBuilder `/help` slash command

**Files:**
- Create: `src/utils/commands/help.js`
- Modify: `src/utils/bot.js`

**Interfaces:**
- Consumes: `buildHelpMessage()` from `src/config/help.js`
- Produces: `HelpCommandData`, `handleHelpCommand(interaction)` → boolean

- [ ] **Step 1: Create command module**

```javascript
// src/utils/commands/help.js
import { buildHelpMessage } from "../../config/help.js";
import { replyEphemeral } from "../interactionUi.js";

export const HelpCommandData = {
  name: "help",
  description: "What to run — setup, Ko-fi redeem, and companion bot"
};

export async function handleHelpCommand(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "help") return false;
  await replyEphemeral(interaction, { content: buildHelpMessage() });
  return true;
}
```

- [ ] **Step 2: Register in `src/utils/bot.js`**

Import `HelpCommandData`, `handleHelpCommand`. Add to `Routes.applicationCommands` body array alongside `SetupCommandData`. In `interactionCreate`, call `handleHelpCommand` before setup handler.

- [ ] **Step 3: Manual verify**

Deploy or run bot locally; `/help` returns ephemeral guide.

- [ ] **Step 4: Commit**

```bash
git add src/utils/commands/help.js src/utils/bot.js
git commit -m "feat(help): register /help slash command on JustTheBuilder"
```

---

### Task 3: Align Builder `jtb_help` button with `/help`

**Files:**
- Modify: `src/utils/onboarding/flow.js`

**Interfaces:**
- Consumes: `buildHelpMessage()` from `src/config/help.js`

- [ ] **Step 1: Replace inline `jtb_help` content**

In `jtb_help` handler, `interaction.reply({ ephemeral: true, content: buildHelpMessage() })`.

- [ ] **Step 2: Run existing tests**

```bash
node --test src/config/marketing.test.js src/config/help.test.js
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/onboarding/flow.js
git commit -m "refactor: jtb_help button uses shared help copy"
```

---

### Task 4: JustTheHelper help copy module

**Repo:** `jmenichole/justthehelper`

**Files:**
- Create: `src/config/help.js`
- Create: `src/config/help.test.js`

**Interfaces:**
- Produces: `export function buildHelpMessage({ shopUrl } = {})` → `string`

- [ ] **Step 1: Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHelpMessage } from "./help.js";

describe("buildHelpMessage", () => {
  it("lists welcome and subscribe flows", () => {
    const text = buildHelpMessage({ shopUrl: "https://ko-fi.com/s/test" });
    assert.match(text, /\/welcome set-role/);
    assert.match(text, /\/subscribe info/);
    assert.match(text, /ko-fi\.com\/s\/test/);
    assert.doesNotMatch(text, /\/setup/);
  });
});
```

- [ ] **Step 2: Implement `src/config/help.js`**

Include sections: free welcome, `/remind`, unlock tickets (`/subscribe info` → shop URL → `/subscribe status`), tickets setup/panel, footer. Read default shop URL from param; command handler passes `kofiPageUrl()` from billing.

- [ ] **Step 3: Run test, commit**

```bash
node --test src/config/help.test.js
git add src/config/help.js src/config/help.test.js
git commit -m "feat(help): add JustTheHelper help copy module"
```

---

### Task 5: JustTheHelper `/help` slash command

**Files:**
- Create: `src/utils/commands/help.js`
- Modify: `src/utils/bot.js`

- [ ] **Step 1: Create handler** — ephemeral reply with `buildHelpMessage({ shopUrl: kofiPageUrl() })`.

- [ ] **Step 2: Register** — add `HelpCommandData` to REST put body: `[WelcomeCommandData, SubscribeCommandData, TicketsCommandData, RemindCommandData, HelpCommandData]`.

- [ ] **Step 3: Commit**

```bash
git add src/utils/commands/help.js src/utils/bot.js
git commit -m "feat(help): register /help on JustTheHelper"
```

---

### Task 6: JustTheHelper install onboarding DM + buttons

**Files:**
- Create: `src/utils/onboarding/flow.js`
- Modify: `src/utils/events/guildCreate.js`
- Modify: `src/utils/bot.js`

**Interfaces:**
- Produces: `startHelperOnboarding(user, guild, client)`, `handleHelperOnboardingButton(interaction)`

- [ ] **Step 1: Implement `startHelperOnboarding`**

Mirror Builder pattern:
- DM owner with short intro + 3 buttons (`jth_help_welcome`, `jth_help_subscribe`, `jth_help_commands`)
- `catch`: `guild.systemChannel?.send("⚠️ I couldn't DM you… Run /help in your server.")`

- [ ] **Step 2: Button handler**

| customId | Reply content |
|----------|----------------|
| `jth_help_welcome` | `/welcome set-role` → `/welcome post` |
| `jth_help_subscribe` | `/subscribe info` + shop URL |
| `jth_help_commands` | full `buildHelpMessage()` |

- [ ] **Step 3: Wire `guildCreate.js`**

After `postGuildInstall`, `fetchOwner()`, call `startHelperOnboarding`.

- [ ] **Step 4: Wire `bot.js` `interactionCreate`** for `isButton()` → `handleHelperOnboardingButton`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/onboarding/flow.js src/utils/events/guildCreate.js src/utils/bot.js
git commit -m "feat(onboarding): Helper install DM with help buttons"
```

---

### Task 7: Deploy + manual smoke

- [ ] **justthebuilder:** push `main`, confirm Fly deploy green, `/help` works in test guild.

- [ ] **justthehelper:** push branch, `fly deploy -a justthehelper`, re-invite bot:
  - Owner receives DM OR system-channel fallback
  - Buttons return correct hints
  - `/help` matches button “command list”

- [ ] **Commit docs** (justthebuilder repo only):

```bash
# already in spec; optional README one-liner under commands
git commit -m "docs: note /help command in README"  # if README updated
```

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Builder `/help` scenarios | Task 1–2 |
| Helper `/help` | Task 4–5 |
| Helper install DM option C | Task 6 |
| Buttons hint slash | Task 6 |
| `jtb_help` DRY | Task 3 |
| Phase 2 out of scope | Not in plan |
| Tests | Tasks 1, 4 |
| Manual smoke | Task 7 |

No TBD placeholders remain.

## Execution handoff

**Plan saved to:** `docs/superpowers/plans/2026-07-18-slash-help-onboarding.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement all tasks in this session with checkpoints  

**Which approach do you want?**
