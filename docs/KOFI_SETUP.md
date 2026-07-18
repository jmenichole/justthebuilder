# Ko-fi payments setup

Shop: **https://ko-fi.com/s/2c6f47f1fc**

Ko-fi provides **one webhook per account** — all shop orders (every product you sell) hit the same URL. JustTheBuilder **ignores** shop orders that are not its items (no redeem code, no DM).

| Event | What happens |
|--------|----------------|
| Donation / membership / non-shop | Ignored (`ignored_type`) |
| Shop order for **another** product | Ignored (`ignored_shop_item`) |
| Shop order for **Basic Build Pack** (`2c6f47f1fc`) | `JTB-XXXXXX` code + optional DM |
| Shop order for **Creator Pack** (when listed) | 3 credits — set `KOFI_CREATOR_SHOP_ITEM_CODE` |

To allow a new JTB shop item, set its `direct_link_code` in Fly env:

```bash
flyctl secrets set KOFI_SHOP_ITEM_CODE=your-item-code -a justthebuilder
# and/or for Creator Pack:
flyctl secrets set KOFI_CREATOR_SHOP_ITEM_CODE=your-creator-code -a justthebuilder
```

Find `direct_link_code` in the Ko-fi shop item URL (`ko-fi.com/s/XXXX`) or webhook test payload `shop_items[].direct_link_code`.

**Other bots' add-ons:** no action needed — they are ignored automatically. Each other bot would need its own webhook endpoint on its own Fly app (or a shared router you build separately).

## Ko-fi API key (`KF_API_...`) — shop tools & agents

Separate from the **webhook verification token**. Use the API key for listing/creating shop items, syncing your catalog, and querying transactions.

### Where to store (never commit to git)

| Use case | Where |
|----------|--------|
| **Production (JustTheBuilder)** | `flyctl secrets set KOFI_API_KEY=KF_API_... -a justthebuilder` |
| **All your repos / GitHub Actions** | GitHub org → Settings → Secrets → `KOFI_API_KEY` |
| **Cursor Cloud Agent** | Environment → Secrets → `KOFI_API_KEY` |
| **Local / CLI** | `.env` in project root (gitignored) |

**Rotate** any key that was pasted in chat or committed by mistake.

### CLI (agents & local dev)

```bash
export KOFI_API_KEY="KF_API_..."   # use your rotated key
npm run kofi -- whoami
npm run kofi -- shop list
npm run kofi -- shop create --name "Creator Pack" --price 2.99 --description "3 unlock credits"
npm run kofi -- catalog sync
npm run kofi -- transactions --limit 10
```

`catalog sync` writes `data/kofi/shop-catalog.json` so webhooks auto-recognize your shop item codes.

### Discord (bot owner)

After `KOFI_API_KEY` is on Fly:

- `/grant kofi shop-list`
- `/grant kofi shop-sync`
- `/grant kofi shop-create name:... price:...`

**Note:** Ko-fi may not allow creating products via API on all accounts. If `shop create` fails, create the item in the [Ko-fi shop dashboard](https://ko-fi.com/manage/shop) then run `catalog sync`.

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

**Basic Build Pack ($0.99):**

```
Thanks for your purchase! 🎉

Free: AI designs your server. $0.99: we build it.

1. Open Discord → a server YOU OWN with JustTheBuilder
2. Run /setup run (if you haven't done the interview)
3. Run /setup redeem code:YOUR-CODE
4. Run /setup unlock

Your code: check DMs from JustTheBuilder (if you entered your Discord User ID at checkout), or use the transaction ID from your Ko-fi email with /setup redeem.

Full instructions: https://justthebuilder.fly.dev/kofi/thanks
Support: https://discord.gg/NEePze3rZd
```

**Creator Pack ($2.99 — 3 unlock credits):** List as a separate Ko-fi shop item named "Creator Pack". Webhook auto-grants 3 credits when amount ≥ $2.50 or item name contains "Creator". Set `KOFI_CREATOR_SHOP_ITEM_CODE` if needed.

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
