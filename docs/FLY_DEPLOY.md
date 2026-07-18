# Fly.io deploy (SSO org)

App: **`justthebuilder`** · Org: **`jamie-vargas`**

## Why deploy tokens fail

If your Fly account uses **SSO** through an organization, `fly tokens create deploy` will fail with:

> Access Tokens cannot be created for your account because an organization you are a member of requires Single Sign On (SSO).

Use an **org-scoped token** instead (same `FLY_API_TOKEN` env var everywhere).

## 1. Create org token (run locally after SSO login)

```bash
flyctl auth login
flyctl tokens org -o jamie-vargas --name "justthebuilder-github-deploy"
```

Copy the printed token. It is shown once.

## 2. GitHub Actions (auto-deploy on push to `main`)

1. Repo → **Settings → Secrets and variables → Actions**
2. New secret: **`FLY_API_TOKEN`** = org token from step 1
3. **Actions → Deploy to Fly.io → Run workflow** (or push to `main`)

Workflow: `.github/workflows/fly-deploy.yml`

## 3. One-off deploy from your machine

```bash
export FLY_API_TOKEN="<org-token>"
flyctl deploy -a justthebuilder --ha=false
```

## 4. Ko-fi webhook secret (production)

From [ko-fi.com/manage/webhooks](https://ko-fi.com/manage/webhooks) → Advanced → **Verification token**:

```bash
export FLY_API_TOKEN="<org-token>"
flyctl secrets set KOFI_VERIFICATION_TOKEN="<kofi-verification-token>" -a justthebuilder
```

See also: [KOFI_SETUP.md](./KOFI_SETUP.md)

## 5. Verify

```bash
curl https://justthebuilder.fly.dev/health
curl -I https://justthebuilder.fly.dev/kofi/thanks   # expect 200, not 404
```

## Cursor Cloud Agent

To let a cloud agent run `flyctl` for you, add the same org token to your Cursor **environment secrets** as **`FLY_API_TOKEN`** (and optionally **`KOFI_VERIFICATION_TOKEN`**).
