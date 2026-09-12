# GitHub Actions Cloudflare Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `main`-branch GitHub Actions workflow that lints, tests, and deploys FoodTrace to Cloudflare Workers via OpenNext.

**Architecture:** One workflow file mirrors local `pnpm deploy`, gated by lint/test. Auth via GitHub secrets; `NEXT_PUBLIC_BASE_URL` set at build time. Migrations and Worker secrets stay manual.

**Tech Stack:** GitHub Actions, pnpm 10.6.5, Node 22, `@opennextjs/cloudflare`, Wrangler

## Global Constraints

- Trigger: `push` to `main` and `workflow_dispatch` only
- Gate: lint + test must pass before deploy
- No D1 migrate in CI
- Do not commit secrets; document GitHub secret names only
- Preserve existing `pnpm deploy` script

## File map

| File | Role |
| --- | --- |
| `.github/workflows/deploy.yml` | CI/CD pipeline |
| `README.md` | Document secrets + auto-deploy |

---

### Task 1: Add deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] Create workflow with checkout, pnpm/action-setup, setup-node (cache pnpm), install, lint, test, deploy
- [ ] Pass `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_BASE_URL` on deploy step
- [ ] Commit: `ci: add Cloudflare Workers deploy on main`

### Task 2: Document in README

**Files:**
- Modify: `README.md` (Deploy section)

- [ ] Note that pushes to `main` deploy via GitHub Actions
- [ ] List required `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets
- [ ] Commit: `docs: document GitHub Actions Cloudflare deploy`
