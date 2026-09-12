# Streaming report agent traces — design

**Date:** 2026-09-12  
**Status:** Approved  
**Depends on:** batch AI product report (`/reports/[batch_id]`), IFM K2 Horizon agent

## Goal

Keep fingerprint-cached product reports, but make generation/regeneration a **live, read-only agent trace** in a **side panel**, with **temperature 0.7** and an explicit **Regenerate** control.

## Non-goals

- User chat / follow-up messages into the agent
- Persisting traces in D1 (session-only UI unless we add later)
- Changing `BatchReportData` schema or the white PDF report sheet layout (aside from page chrome)

## UX

### Layout

- **Desktop:** split view — report sheet **left** (primary), agent trace **right**
- **Mobile:** stack — report first, trace below (collapsible when idle)
- Trace is **display-only** (no input box). Auto-scroll while streaming.

### Cache behavior

| State | Behavior |
| --- | --- |
| Fingerprint cache hit | SSR/serve cached report immediately. Trace idle: “Agent trace appears when you regenerate.” |
| Cache miss | Page loads without blocking on the model. Client **auto-starts** stream; trace shows live steps; report fills when structured output arrives. |
| Regenerate | Toolbar **Regenerate** button starts a new stream (disables while running). On success, upserts D1 cache and replaces the left report. |
| `?refresh=1` | Optional deep-link: same as clicking Regenerate once on mount. |

### Trace content (read-only events)

Show chronological events derived from the AI SDK stream:

- Reasoning / thinking parts (when the model emits them)
- Tool call start + args (summary)
- Tool results (truncated JSON)
- Assistant text deltas
- Final structured report ready / errors

## Architecture

```
Browser  →  GET /reports/[batch_id]
              └─ loadCachedReport only (no IFM on SSR)
              └─ ReportWorkspace (client): report + side panel + Regenerate

         →  POST /api/reports/[batch_id]/stream
              └─ streamText (IFM chat, temp 0.7, tools, Output.object)
              └─ UI/message or NDJSON event stream
              └─ onFinish: parse BatchReportData, upsert batch_reports
```

### Server changes

- Split `report-service`: `loadCachedReport(batchId)` for page; generation only via stream route.
- Refactor `report-agent` to share prompt/tools/model setup between sync helpers (tests) and `streamBatchReport`.
- Default `temperature: 0.7` (override via optional `IFM_TEMPERATURE` later if needed — not required for v1).
- Keep OpenRouter for photo validation only.

### Client changes

- New `ReportWorkspace` client component owning report state, stream connection, Regenerate button, side panel.
- Page becomes thin: fetch batch + cached report (or null), render workspace.

## Env

Unchanged keys: `IFM_API_KEY`, `IFM_MODEL`. Temperature fixed at `0.7` in code for v1.

## Risks

- IFM may not emit reasoning parts — panel still shows tools + text + status.
- Structured `Output.object` with streaming: must wait for finish before swapping report; show “assembling report…” in panel if needed.
- Cloudflare Worker timeouts on long streams — keep `stopWhen: stepCountIs(12)`; document if Worker max duration needs bump.

## Success criteria

1. Cache hit: report visible immediately; no IFM call.
2. Regenerate: side panel streams live events; new report replaces left pane; D1 updated.
3. Cache miss: auto-stream without full-page blocking spinner for the whole generation.
4. No chat input in the trace panel.
5. Temperature 0.7 on generate/regenerate streams.
