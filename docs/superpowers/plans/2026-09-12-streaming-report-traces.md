# Streaming Report Traces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Side-panel live agent traces for report generate/regenerate (read-only), keep D1 cache, temperature 0.7.

**Architecture:** Page SSR serves cache only. Client `ReportWorkspace` streams from `POST /api/reports/[batch_id]/stream` (IFM `streamText` + NDJSON events). Regenerate button starts a new stream; cache miss auto-starts. On finish, upsert D1 and swap report.

**Tech Stack:** Next.js App Router, AI SDK `streamText` + `Output.object`, IFM OpenAI-compatible chat, React client components.

**Spec:** `docs/superpowers/specs/2026-09-12-streaming-report-traces-design.md`

## Global Constraints

- Temperature fixed at `0.7`
- Trace panel is not chattable
- Desktop: report left, trace right; mobile: stack
- Do not change `BatchReportData` schema
- Keep OpenRouter for photo validation only

---

### Task 1: Agent streaming + temperature

**Files:**
- Modify: `src/lib/report-agent.ts`
- Modify: `src/lib/report-agent.test.ts`

**Interfaces:**
- Produces: `REPORT_TEMPERATURE = 0.7`, `streamBatchReport(batchId)` returning `{ stream, model, resultPromise }` or similar for the API route; sync `generateBatchReport` also uses temp 0.7

- [ ] Extract shared system/prompt/tools/model builder
- [ ] Add `temperature: 0.7` to generate/stream calls
- [ ] Add `streamBatchReport` using `streamText` with same tools + `Output.object`
- [ ] Update missing-key test; add temp constant export test if useful
- [ ] Commit

### Task 2: Cache-only page service

**Files:**
- Modify: `src/lib/report-service.ts`
- Optional test: cache hit path unchanged semantics

**Interfaces:**
- Produces: `loadCachedReport(batchId)` → `{ ok, report?, model?, cached, fingerprint } | { ok:false }`
- Keep upsert helper callable from stream route (`saveGeneratedReport`)

- [ ] Split load vs save; page no longer calls IFM
- [ ] Commit

### Task 3: Stream API route

**Files:**
- Create: `src/app/api/reports/[batch_id]/stream/route.ts`

**Interfaces:**
- `POST` → `text/x-ndjson` lines: `{type:'reasoning'|'text'|'tool-call'|'tool-result'|'status'|'done'|'error', ...}`
- `done` includes `{ report, model }`
- On success upsert via `saveGeneratedReport`

- [ ] Implement route with abort signal from request
- [ ] Map `fullStream` parts to NDJSON
- [ ] Commit

### Task 4: ReportWorkspace UI

**Files:**
- Create: `src/components/AgentTracePanel.tsx`
- Create: `src/components/ReportWorkspace.tsx`
- Modify: `src/app/reports/[batch_id]/page.tsx`
- Modify: `src/app/reports/[batch_id]/loading.tsx` (lighter skeleton)

**Interfaces:**
- `ReportWorkspace({ batchId, initialReport, initialModel, autoStart })`
- Regenerate button; `?refresh=1` → `autoStart`

- [ ] Side panel + report layout
- [ ] Consume NDJSON stream
- [ ] Wire page
- [ ] Commit

### Task 5: Smoke verify

- [ ] `pnpm test`
- [ ] Manual: cached load, regenerate with visible trace, cache miss auto-start
