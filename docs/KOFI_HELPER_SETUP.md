# JustTheHelper — Ko-fi shop pass ($1.99)

JustTheHelper tickets use a **Ko-fi shop item** (one-time purchase, ~31 days per server) because Ko-fi does not expose an API to create **membership tiers**.

| Product | Ko-fi type | Price | Unlocks |
|---------|------------|-------|---------|
| Basic Build Pack | Shop | $0.99 | JustTheBuilder full polish |
| **JustTheHelper Guild Pass** | Shop | $1.99 | Tickets for one server ~31 days |

Webhook URL (one per Ko-fi account): **`https://justthebuilder.fly.dev/webhooks/kofi`**

Builder forwards Helper shop orders to `https://justthehelper.fly.dev/webhooks/kofi`.

---

## 1. Create the shop item (API)

Set `KOFI_API_KEY` (`KF_API_...` from Ko-fi → Settings → API). **Never commit the key.**

```bash
# Local or after: flyctl secrets set KOFI_API_KEY=KF_API_... -a justthebuilder
npm run kofi -- shop create-helper
npm run kofi -- catalog sync
```

Or in Discord (bot owner, user-install `/grant`):

```
/grant kofi shop-create-helper
/grant kofi shop-sync
```

If API create fails, add the product manually at [ko-fi.com/manage/shop](https://ko-fi.com/manage/shop) with the same name/price, then set the `direct_link_code` from the shop URL (`ko-fi.com/s/XXXX`).

**Production shop item:** `https://ko-fi.com/s/014936eaac` → `KOFI_HELPER_SHOP_ITEM_CODE=014936eaac`

---

## 2. Fly secrets

```bash
# Builder — recognize & forward Helper shop orders
flyctl secrets set KOFI_HELPER_SHOP_ITEM_CODE=YOUR_CODE -a justthebuilder

# Helper — /subscribe info links buyers here
flyctl secrets set KOFI_PAGE_URL=https://ko-fi.com/s/YOUR_CODE -a justthehelper
```

Redeploy both apps after setting secrets.

---

## 3. Ko-fi shop buyer message (manual)

In the shop item settings, set **message for buyers** on the **Helper** shop item only (`/subscribe`, code **JTH-XXXXXX**):

```
Thanks! Before you pay: run /subscribe info in Discord and paste your server code (JTH-XXXXXX) in this checkout message field.

After payment: run /subscribe status — tickets unlock within a minute.
Then /tickets setup and /tickets panel.
```

**Do not** use this text on the JustTheBuilder ($0.99) shop item.

**Digital delivery (Ko-fi requires one of these):**

| Option | Value |
|--------|--------|
| **Redirect buyer to URL** (recommended) | `https://justthebuilder.fly.dev/kofi/helper-thanks` |
| **Upload a file** | Use `assets/justthehelper-guild-pass-readme.txt` from this repo |

---

## 4. Discord flow

1. Admin runs **`/subscribe info`** → copies `JTH-XXXXXX`
2. Buys **JustTheHelper Guild Pass** on Ko-fi
3. Pastes **`JTH-XXXXXX`** in the Ko-fi checkout message field
4. Runs **`/subscribe status`** → tickets unlocked
5. **`/tickets setup`** → **`/tickets panel`**

Renewal: buy the shop pass again before expiry (~31 days). Not auto-billing.

---

## 5. Test

Send a test **Shop Order** webhook from [ko-fi.com/manage/webhooks](https://ko-fi.com/manage/webhooks) with your Helper shop item `direct_link_code` and `JTH-XXXXXX` in `message`.
