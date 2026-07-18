# Ko-fi payments setup

Shop: **https://ko-fi.com/s/2c6f47f1fc**

## Important: Ko-fi has no custom redirect URL

Ko-fi does **not** send buyers to an external URL after checkout. They stay on Ko-fi’s built-in thank-you screen.

Use these instead:

| Where | What to set |
|--------|-------------|
| **Ko-fi shop → item → message for buyers** | Thank-you + redeem instructions (copy below) |
| **Ko-fi → Webhooks** | `https://justthebuilder.fly.dev/webhooks/kofi` |
| **Fly.io env** | `KOFI_VERIFICATION_TOKEN` from Ko-fi → Webhooks → Advanced |
| **Optional link in shop message** | `https://justthebuilder.fly.dev/kofi/thanks` |

### Suggested shop thank-you message (paste in Ko-fi)

```
Thanks for your purchase! 🎉

1. Open Discord → a server YOU OWN with JustTheBuilder
2. Run /setup run (if you haven't done the interview)
3. Run /setup redeem code:YOUR-CODE
4. Run /setup unlock

Your code: check DMs from JustTheBuilder (if you entered your Discord User ID at checkout), or use the transaction ID from your Ko-fi email with /setup redeem.

Full instructions: https://justthebuilder.fly.dev/kofi/thanks
Support: https://discord.gg/NEePze3rZd
```

### Recommended checkout question (Ko-fi shop item)

Add a custom question on the shop item:

**Discord User ID** (Settings → Advanced → Developer Mode → Copy User ID)

The bot parses this from the buyer message and DMs the redeem code automatically.

## Webhook setup

1. Go to https://ko-fi.com/manage/webhooks
2. Webhook URL: `https://justthebuilder.fly.dev/webhooks/kofi`
3. Copy **Verification token** → set `KOFI_VERIFICATION_TOKEN` on Fly.io
4. Send a test **Shop Order** from the Ko-fi webhooks page
5. Confirm ops analytics channel shows `kofi_purchase` with a `JTB-XXXXXX` code

## Buyer flow

```
Pay on Ko-fi
  → Webhook creates JTB-XXXXXX code
  → (Optional) DM to Discord User ID
  → Owner runs /setup redeem in their server
  → /setup unlock applies polish
```

## Environment variables

See `src/config/env.example`:

- `KOFI_VERIFICATION_TOKEN` (required for webhooks)
- `PUBLIC_BASE_URL` (default `https://justthebuilder.fly.dev`)
- `KOFI_SHOP_URL` (default `https://ko-fi.com/s/2c6f47f1fc`)

## GitHub Pages thank-you mirror

Static copy also deploys to GitHub Pages as `/kofi-thanks.html` for marketing links. The **live** thank-you page with optional `?code=` query is on Fly: `/kofi/thanks`.
