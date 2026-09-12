# GitHub Actions → Cloudflare Workers (OpenNext) Deploy

**Date:** 2026-09-12  
**Status:** Approved

## Goal

Every push to `main` runs lint + test, then deploys the OpenNext Cloudflare Worker so https://foodtrace.oliverchou.dev reflects the new commit.

## Decisions

| Decision | Choice |
| --- | --- |
| Trigger branch | `main` only (+ `workflow_dispatch`) |
| Pre-deploy gate | Full: install → lint → test → deploy |
| D1 migrations | Manual (`pnpm db:migrate`); not in CI |
| Worker secrets | Already on Cloudflare via `pnpm secrets:put`; CI does not re-upload |
| Deploy command | Existing `pnpm deploy` (`opennextjs-cloudflare build && opennextjs-cloudflare deploy`) |
| Approach | Single workflow file; not wrangler-action; not split CI/CD |

## Workflow

File: `.github/workflows/deploy.yml`

1. Checkout
2. Setup pnpm (`packageManager`: `pnpm@10.6.5`) + Node 22 with pnpm cache
3. `pnpm install --frozen-lockfile`
4. `pnpm lint`
5. `pnpm test`
6. Deploy with env:
   - `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` from GitHub secrets
   - `NEXT_PUBLIC_BASE_URL=https://foodtrace.oliverchou.dev` (build-time inline)

## Required GitHub secrets

- `CLOUDFLARE_API_TOKEN` — API token with Workers Edit (and related deploy perms) on account `4d38bd1c6da9280b84dae11bb89d5400`
- `CLOUDFLARE_ACCOUNT_ID` — `4d38bd1c6da9280b84dae11bb89d5400`

## Out of scope

- PR / preview deploys
- Auto D1 migrations
- Re-putting Worker runtime secrets from CI
- Changing OpenNext or Wrangler config

## Docs

README Deploy section notes the workflow and required secrets.
