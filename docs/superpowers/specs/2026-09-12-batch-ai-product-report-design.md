# Batch AI Product Report — Design

**Date:** 2026-09-12
**Status:** Approved for planning
**Product:** FoodTrace (farm-to-shelf provenance on Solana)

## Goal

Add a public, shareable **product report** page at `/reports/[batch_id]` that runs an OpenRouter-backed AI SDK agent to turn batch + stage + org provenance into a consumer-friendly product story with an auditor appendix. Generation is **cacheable and durable**: store structured JSON in SQLite and reuse it until batch inputs change (or the user force-refreshes).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Cache | Stable until stages/batch inputs change; SQLite `batch_reports` |
| Audience | Both consumer (story) and auditor (provenance appendix) |
| Output | Structured JSON → React PDF-style page |
| Access | Public (no auth), same spirit as `/verify/[id]` |
| Architecture | Page-triggered generate + fingerprint cache (Approach A) |
| PDF binary | Out of scope — HTML print-to-PDF is enough |
| Background gen on stage write | Out of scope |

## Architecture

```
Browser  →  GET /reports/[batch_id](?refresh=1)
              │
              ├─ load batch, stages, related orgs
              ├─ fingerprint = hash(report inputs)
              ├─ if cached row matches fingerprint and !refresh
              │     → render BatchReport from report_json
              └─ else
                    → ToolLoopAgent (OpenRouter) with read-only tools
                    → Output.object(reportSchema)
                    → upsert batch_reports
                    → render BatchReport
```

### Fingerprint

Compute a stable hash over:

- Batch: `id`, `name`, `origin`, `asset`, `mint_sig`, `farmer_org_id`, `created_at`
- Each stage (ordered): `id`, `stage`, `photo_hash`, `note`, `actor`, `actor_org_id`, `tx_sig`, `created_at`
- Related orgs (farmer + actor orgs): `id`, `name`, `role`, `certifications`, `verification_status`, `location_lat`, `location_lng`, `grid_region` (never password or secrets)

When any of these change, fingerprint mismatches → regenerate on next visit.

### Cache table: `batch_reports`

| Column | Type | Notes |
|--------|------|--------|
| `batch_id` | TEXT PK | FK → `batches(id)` |
| `fingerprint` | TEXT NOT NULL | Invalidation key |
| `report_json` | TEXT NOT NULL | Serialized structured report |
| `model` | TEXT NOT NULL | OpenRouter model id used |
| `created_at` | INTEGER NOT NULL | First generation |
| `updated_at` | INTEGER NOT NULL | Last generation |

Helpers in `src/lib/db.ts`: `getBatchReport(batchId)`, `upsertBatchReport(row)`.

## Agent

### Stack

- Vercel AI SDK (`ai`) with structured output via `Output.object({ schema })`
- OpenRouter via `@openrouter/ai-sdk-provider` only (no direct OpenAI SDK)
- Zod schema in `src/lib/report-schema.ts`

### Env

- `OPENROUTER_API_KEY` — required to generate (cache hits work without it)
- `OPENROUTER_MODEL` — optional; default `openai/gpt-4o-mini` (document in README)

### Tools (read-only)

Agent must not invent stages or orgs. Tools:

1. `getBatchContext` — batch row + farmer org public profile
2. `listStages` — stages for the batch with labels from `STAGES`
3. `getOrg` — public org by id
4. `getChainAttributes` (optional) — on-chain attributes when RPC is available; failures become auditor integrity notes, not hard failures

Bound tools to the requested `batch_id` so the agent cannot read other batches.

### Prompt rules

- Ground every factual claim in tool data
- Soft marketing language only in `product` / `journey` / `trust`
- `auditor` section stays factual (hashes, txs, org names/roles/certs)
- Pending stages appear in `journey` as `status: "pending"` with no fabricated completion details

## Report JSON schema

```ts
{
  product: {
    title: string;
    tagline: string;
    originStory: string;      // 2–4 short paragraphs
    highlights: string[];     // 3–5 bullets
  },
  journey: Array<{
    stageId: number;
    stageLabel: string;
    headline: string;
    summary: string;
    status: "completed" | "pending";
  }>,
  trust: {
    verificationSummary: string;
    badges: string[];
  },
  auditor: {
    batchId: string;
    nftAsset: string;
    mintTx: string;
    farmerOrg: {
      name: string;
      role: string;
      certifications: string[];
      verificationStatus: string;
      location?: string;
    } | null;
    stages: Array<{
      stageId: number;
      label: string;
      actor: string;
      actorOrg: {
        name: string;
        role: string;
        certifications: string[];
      } | null;
      recordedAt: string;     // ISO
      photoHash: string;
      txSig: string;
      note: string;
    }>;
    integrityNotes: string[];
  },
  generatedAt: string;        // ISO
}
```

Validate with Zod before caching. On schema failure: do not write cache; show error UI (no automatic retry loop).

## UI

### Route

`src/app/reports/[batch_id]/page.tsx`

- Public, no session required
- Missing batch → `notFound()`
- Normalize id to uppercase to match existing batch ids

### Renderer

`src/components/BatchReport.tsx` — white, scrollable, letter-ish sheet (~816px max-width), print-friendly:

1. Cover — title, tagline, batch `#`, origin, generated date
2. Product story — originStory + highlights
3. Journey timeline — completed vs pending
4. Trust — badges + verification summary
5. Auditor appendix — NFT, mint tx, stage hash table, orgs, integrity notes
6. Footer — link to `/verify/[id]`, FoodTrace mark

Generation runs in the server page (v1 blocks until done). The browser shows the normal Next navigation/loading state; no separate streaming UI.
Error: agent/API/schema failure shows message + retry link (`?refresh=1`).
Print: `@media print` hides site chrome; keeps the sheet.

### Discovery

- Dashboard batch list: “Report” link → `/reports/[id]`
- Verify page: “Product report” link

Visual language: white document on the existing cream/forest app chrome; do not redesign the rest of the app. Report sheet itself is intentionally white (PDF-style), not cream cards.

## Files

| Path | Role |
|------|------|
| `src/lib/report-schema.ts` | Zod schema + types |
| `src/lib/report-fingerprint.ts` | Fingerprint builder |
| `src/lib/report-agent.ts` | OpenRouter + agent + tools |
| `src/lib/db.ts` | `batch_reports` + helpers |
| `src/app/reports/[batch_id]/page.tsx` | Page orchestration |
| `src/components/BatchReport.tsx` | PDF-style renderer |
| `src/app/HomeDashboard.tsx` | Report link |
| `src/app/verify/[id]/page.tsx` | Report link |
| `README.md` | Env vars for OpenRouter |

## Error handling

| Case | Behavior |
|------|----------|
| Unknown batch | 404 |
| Cache hit | Render immediately |
| Cache miss, no API key | Clear error: configure `OPENROUTER_API_KEY` |
| Agent / OpenRouter failure | Error UI + `?refresh=1` retry |
| Schema validation failure | Do not cache; show error |
| Chain RPC failure | Continue; note in `auditor.integrityNotes` |

## Testing

- Unit: fingerprint changes when a stage is added/changed; stable when inputs unchanged
- Unit: Zod schema accepts a fixture report; rejects missing required fields
- Unit/integration: `upsertBatchReport` + get by fingerprint match
- Agent tools: mocked DB returns only the bound batch
- Page: notFound for missing id (existing Next test patterns if any)

Manual: open `/reports/[id]` twice (second should skip OpenRouter if fingerprint matches); add a stage; reopen and confirm regenerate.

## Out of scope

- Auth gating / role-based auditor section
- Native PDF file download
- Generating on stage POST
- Streaming token UI (optional later; v1 can block on server generate)
- Changing mint/verify/station flows beyond adding links
