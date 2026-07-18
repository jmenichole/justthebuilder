# Ko-fi shop copy — two products, one account

One webhook: `https://justthebuilder.fly.dev/webhooks/kofi`

| | **JustTheBuilder** | **JustTheHelper** |
|--|-------------------|-------------------|
| Product | Basic Build Pack | Guild Pass (1 month) |
| Price | $0.99 | $1.99 |
| Bot | JustTheBuilder | JustTheHelper |
| Code | **JTB-XXXXXX** (auto-DM or redeem) | **JTH-XXXXXX** (you paste at checkout) |
| Redirect URL | `https://justthebuilder.fly.dev/kofi/thanks` | `https://justthebuilder.fly.dev/kofi/helper-thanks` |

---

## JustTheBuilder — message for buyers

```
Thanks for your purchase! 🎉

1. Open Discord → a server YOU OWN with JustTheBuilder
2. Run /setup run (if you haven't done the interview)
3. Run /setup redeem code:YOUR-CODE
4. Run /setup unlock

Your code: check DMs from JustTheBuilder, or use your Ko-fi transaction ID with /setup redeem.

https://justthebuilder.fly.dev/kofi/thanks
```

**Checkout custom question (recommended):** Discord User ID — bot DMs the JTB code automatically.

---

## JustTheHelper — message for buyers

```
Thanks! Before you pay: run /subscribe info in Discord and paste your server code (JTH-XXXXXX) in this checkout message field.

After payment: run /subscribe status — tickets unlock within a minute.
Then /tickets setup and /tickets panel.
```

**Important:** Buyer must paste **JTH-XXXXXX** during checkout. The bot does not DM this code.

---

## Common mistakes

| Wrong | Right |
|-------|-------|
| JTH code on Builder product | JTB flow: redeem → unlock |
| /subscribe on Builder product | /setup redeem → /setup unlock |
| Same thank-you message on both items | Use the matching block above |
| Webhook URL on justthehelper | Keep webhook on **justthebuilder** only |
