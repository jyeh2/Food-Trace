# Batch AI Product Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public `/reports/[batch_id]` page that runs an OpenRouter + AI SDK agent to produce a structured consumer+auditor product report, cached in D1 until batch/stage/org inputs change.

**Architecture:** Page load loads batch context, fingerprints inputs, serves cached `batch_reports` JSON when fingerprint matches; otherwise runs a ToolLoopAgent with read-only tools and Zod `Output.object`, upserts cache, renders a white PDF-style `BatchReport`. Force refresh via `?refresh=1`.

**Tech Stack:** Next.js 16 App Router, AI SDK (`ai`) + `@openrouter/ai-sdk-provider` (≥2.6.0), Zod, Cloudflare D1 via existing `src/lib/d1.ts` / `src/lib/db.ts`, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-12-batch-ai-product-report-design.md`

## Global Constraints

- Storage is **D1** (async `d1*` helpers), not local better-sqlite3 — match current `src/lib/db.ts`.
- Public route: no auth required (like `/verify/[id]`).
- Structured JSON only; render with React — no markdown HTML dump.
- Pin `@openrouter/ai-sdk-provider` ≥ `2.6.0` (tools + `Output.object` fix).
- Default model: `openai/gpt-4o-mini` via `OPENROUTER_MODEL` override.
- Do not redesign app chrome; report sheet is white PDF-style inside existing layout.
- Out of scope: PDF binary download, auth gating, generate-on-stage-write, streaming token UI.

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/lib/report-schema.ts` | Zod schema + `BatchReportData` type + parse helper |
| `src/lib/report-fingerprint.ts` | Pure fingerprint hash from batch/stages/orgs |
| `src/lib/report-agent.ts` | OpenRouter client, tools bound to `batchId`, `generateBatchReport` |
| `src/lib/db.ts` | `batch_reports` in SCHEMA_SQL + get/upsert helpers |
| `migrations/0001_init.sql` | Keep in sync: add `batch_reports` CREATE |
| `migrations/0002_batch_reports.sql` | Additive migration for existing D1 DBs |
| `src/components/BatchReport.tsx` | White scrollable PDF-style renderer |
| `src/app/reports/[batch_id]/page.tsx` | Cache/generate orchestration |
| `src/app/reports/[batch_id]/loading.tsx` | Navigation loading UI |
| `src/app/HomeDashboard.tsx` | Per-batch Report link |
| `src/app/verify/[id]/page.tsx` | Product report link |
| `env.example` + `README.md` | OpenRouter env docs |
| `src/lib/report-schema.test.ts` | Schema tests |
| `src/lib/report-fingerprint.test.ts` | Fingerprint tests |
| `src/lib/db.test.ts` | Extend with report cache tests |
| `src/lib/report-agent.test.ts` | Tool binding + missing-key tests (mock AI) |

---

### Task 1: Report Zod schema

**Files:**
- Create: `src/lib/report-schema.ts`
- Test: `src/lib/report-schema.test.ts`

**Interfaces:**
- Produces: `batchReportSchema` (Zod), `BatchReportData` (inferred type), `parseBatchReport(json: string): BatchReportData`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report-schema.test.ts
import { describe, expect, it } from "vitest";
import { batchReportSchema, parseBatchReport } from "./report-schema";

const fixture = {
  product: {
    title: "Organic Strawberries",
    tagline: "From Green Acres to your table",
    originStory: "Grown on family land in Pennsylvania.\n\nHand-picked at peak ripeness.",
    highlights: ["On-chain photo hashes", "Verified farm org", "Cold-chain tracked"],
  },
  journey: [
    {
      stageId: 1,
      stageLabel: "Farm / Harvest",
      headline: "Harvested at dawn",
      summary: "Picked and logged at the farm station.",
      status: "completed" as const,
    },
    {
      stageId: 2,
      stageLabel: "Processing",
      headline: "Awaiting processing",
      summary: "Not yet recorded.",
      status: "pending" as const,
    },
  ],
  trust: {
    verificationSummary: "Stage 1 photo hash matches on-chain record.",
    badges: ["On-chain hashes", "Farmer verified"],
  },
  auditor: {
    batchId: "ABCD",
    nftAsset: "Asset111",
    mintTx: "Sig111",
    farmerOrg: {
      name: "Green Acres",
      role: "FARMER",
      certifications: ["USDA Organic"],
      verificationStatus: "verified",
      location: "40.44, -79.94",
    },
    stages: [
      {
        stageId: 1,
        label: "Farm / Harvest",
        actor: "Alice",
        actorOrg: { name: "Green Acres", role: "FARMER", certifications: ["USDA Organic"] },
        recordedAt: "2026-09-01T12:00:00.000Z",
        photoHash: "abc",
        txSig: "tx1",
        note: "first pick",
      },
    ],
    integrityNotes: ["Chain attributes reachable."],
  },
  generatedAt: "2026-09-12T15:00:00.000Z",
};

describe("batchReportSchema", () => {
  it("accepts a full fixture", () => {
    expect(batchReportSchema.parse(fixture).product.title).toBe("Organic Strawberries");
  });

  it("rejects missing product.title", () => {
    const bad = structuredClone(fixture);
    // @ts-expect-error test invalid
    delete bad.product.title;
    expect(() => batchReportSchema.parse(bad)).toThrow();
  });

  it("parseBatchReport round-trips JSON", () => {
    const parsed = parseBatchReport(JSON.stringify(fixture));
    expect(parsed.auditor.batchId).toBe("ABCD");
  });

  it("parseBatchReport throws on invalid JSON object", () => {
    expect(() => parseBatchReport("{}")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/report-schema.test.ts`

Expected: FAIL — cannot find module `./report-schema`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/report-schema.ts
import { z } from "zod";

const orgBriefSchema = z.object({
  name: z.string(),
  role: z.string(),
  certifications: z.array(z.string()),
});

export const batchReportSchema = z.object({
  product: z.object({
    title: z.string().min(1),
    tagline: z.string(),
    originStory: z.string().min(1),
    highlights: z.array(z.string()).min(1).max(8),
  }),
  journey: z.array(
    z.object({
      stageId: z.number().int().positive(),
      stageLabel: z.string(),
      headline: z.string(),
      summary: z.string(),
      status: z.enum(["completed", "pending"]),
    }),
  ),
  trust: z.object({
    verificationSummary: z.string(),
    badges: z.array(z.string()),
  }),
  auditor: z.object({
    batchId: z.string(),
    nftAsset: z.string(),
    mintTx: z.string(),
    farmerOrg: z
      .object({
        name: z.string(),
        role: z.string(),
        certifications: z.array(z.string()),
        verificationStatus: z.string(),
        location: z.string().optional(),
      })
      .nullable(),
    stages: z.array(
      z.object({
        stageId: z.number().int().positive(),
        label: z.string(),
        actor: z.string(),
        actorOrg: orgBriefSchema.nullable(),
        recordedAt: z.string(),
        photoHash: z.string(),
        txSig: z.string(),
        note: z.string(),
      }),
    ),
    integrityNotes: z.array(z.string()),
  }),
  generatedAt: z.string(),
});

export type BatchReportData = z.infer<typeof batchReportSchema>;

export function parseBatchReport(json: string): BatchReportData {
  return batchReportSchema.parse(JSON.parse(json));
}
```

- [ ] **Step 4: Install zod if missing, run tests**

Run: `pnpm add zod && pnpm test src/lib/report-schema.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report-schema.ts src/lib/report-schema.test.ts package.json pnpm-lock.yaml
git commit -m "Add Zod schema for batch AI product reports."
```

---

### Task 2: Fingerprint

**Files:**
- Create: `src/lib/report-fingerprint.ts`
- Test: `src/lib/report-fingerprint.test.ts`

**Interfaces:**
- Consumes: `BatchRow`, `StageRow`, `PublicOrg` from `@/lib/db`
- Produces: `buildReportFingerprint(input: { batch: BatchRow; stages: StageRow[]; orgs: PublicOrg[] }): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/report-fingerprint.test.ts
import { describe, expect, it } from "vitest";
import { buildReportFingerprint } from "./report-fingerprint";
import type { BatchRow, PublicOrg, StageRow } from "./db";

const batch: BatchRow = {
  id: "ABCD",
  name: "Berries",
  origin: "PA",
  asset: "asset1",
  mint_sig: "mint1",
  created_at: 100,
  farmer_org_id: "org1",
};

const stage1: StageRow = {
  id: 1,
  batch_id: "ABCD",
  stage: 1,
  photo_file: "a.jpg",
  photo_hash: "hash1",
  note: "n",
  actor: "Alice",
  tx_sig: "tx1",
  created_at: 200,
  actor_org_id: "org1",
};

const org: PublicOrg = {
  id: "org1",
  name: "Green Acres",
  role: "FARMER",
  public_key: null,
  contact_email: "farm@example.com",
  phone: null,
  location_lat: 40.44,
  location_lng: -79.94,
  grid_region: "RFC",
  certifications: '["USDA Organic"]',
  verification_status: "verified",
  active: 1,
  created_at: 1,
  farm_type: null,
  livestock_type: null,
  breed: null,
  herd_size: null,
  avg_weight_kg: null,
  feed_type: null,
  feed_source: null,
  land_area_hectares: null,
  land_use_type: null,
  farming_practice: null,
  onsite_renewable_pct: null,
  facility_type: null,
  facility_energy_source: null,
  facility_renewable_pct: null,
  fleet_type: null,
  refrigeration_type: null,
  processing_capacity_kg_per_day: null,
  default_transport_mode: null,
  buyer_type: null,
  storage_type: null,
  avg_storage_duration_days: null,
  cooking_method: null,
  kitchen_energy_source: null,
  sustainability_program: null,
};

describe("buildReportFingerprint", () => {
  it("is stable for identical inputs", () => {
    const a = buildReportFingerprint({ batch, stages: [stage1], orgs: [org] });
    const b = buildReportFingerprint({ batch, stages: [stage1], orgs: [org] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when a stage photo_hash changes", () => {
    const a = buildReportFingerprint({ batch, stages: [stage1], orgs: [org] });
    const b = buildReportFingerprint({
      batch,
      stages: [{ ...stage1, photo_hash: "hash2" }],
      orgs: [org],
    });
    expect(a).not.toBe(b);
  });

  it("changes when an org certification changes", () => {
    const a = buildReportFingerprint({ batch, stages: [stage1], orgs: [org] });
    const b = buildReportFingerprint({
      batch,
      stages: [stage1],
      orgs: [{ ...org, certifications: "[]" }],
    });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/report-fingerprint.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/report-fingerprint.ts
import { createHash } from "node:crypto";
import type { BatchRow, PublicOrg, StageRow } from "@/lib/db";

function orgSlice(o: PublicOrg) {
  return {
    id: o.id,
    name: o.name,
    role: o.role,
    certifications: o.certifications,
    verification_status: o.verification_status,
    location_lat: o.location_lat,
    location_lng: o.location_lng,
    grid_region: o.grid_region,
  };
}

export function buildReportFingerprint(input: {
  batch: BatchRow;
  stages: StageRow[];
  orgs: PublicOrg[];
}): string {
  const payload = {
    batch: {
      id: input.batch.id,
      name: input.batch.name,
      origin: input.batch.origin,
      asset: input.batch.asset,
      mint_sig: input.batch.mint_sig,
      farmer_org_id: input.batch.farmer_org_id,
      created_at: input.batch.created_at,
    },
    stages: [...input.stages]
      .sort((a, b) => a.stage - b.stage)
      .map((s) => ({
        id: s.id,
        stage: s.stage,
        photo_hash: s.photo_hash,
        note: s.note,
        actor: s.actor,
        actor_org_id: s.actor_org_id,
        tx_sig: s.tx_sig,
        created_at: s.created_at,
      })),
    orgs: [...input.orgs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(orgSlice),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/lib/report-fingerprint.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report-fingerprint.ts src/lib/report-fingerprint.test.ts
git commit -m "Add report input fingerprint for cache invalidation."
```

---

### Task 3: D1 `batch_reports` cache

**Files:**
- Modify: `src/lib/db.ts` (SCHEMA_SQL + helpers)
- Modify: `migrations/0001_init.sql` (add table for fresh installs)
- Create: `migrations/0002_batch_reports.sql`
- Modify: `src/lib/db.test.ts`

**Interfaces:**
- Produces:
  - `export type BatchReportRow = { batch_id: string; fingerprint: string; report_json: string; model: string; created_at: number; updated_at: number }`
  - `getBatchReport(batchId: string): Promise<BatchReportRow | undefined>`
  - `upsertBatchReport(row: BatchReportRow): Promise<void>`

- [ ] **Step 1: Write the failing tests (append to `db.test.ts`)**

```ts
describe("batch_reports cache", () => {
  it("getBatchReport returns undefined when missing", async () => {
    fetchMock.mockResolvedValue(d1Success([]));
    const { getBatchReport } = await loadDb();
    expect(await getBatchReport("ABCD")).toBeUndefined();
  });

  it("upsertBatchReport binds all columns", async () => {
    fetchMock.mockResolvedValue(d1Success());
    const { upsertBatchReport } = await loadDb();
    await upsertBatchReport({
      batch_id: "ABCD",
      fingerprint: "fp",
      report_json: "{}",
      model: "openai/gpt-4o-mini",
      created_at: 1,
      updated_at: 2,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.sql).toMatch(/INSERT INTO batch_reports/i);
    expect(body.params).toEqual(["ABCD", "fp", "{}", "openai/gpt-4o-mini", 1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/db.test.ts`

Expected: FAIL — `getBatchReport` / `upsertBatchReport` not exported

- [ ] **Step 3: Implement schema + helpers**

Add to `SCHEMA_SQL` in `src/lib/db.ts` (after stages table):

```sql
  CREATE TABLE IF NOT EXISTS batch_reports (
    batch_id TEXT PRIMARY KEY REFERENCES batches(id),
    fingerprint TEXT NOT NULL,
    report_json TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
```

Also append the same `CREATE TABLE IF NOT EXISTS batch_reports (...)` to `migrations/0001_init.sql`, and create `migrations/0002_batch_reports.sql` with only that CREATE for existing DBs.

Add types + functions:

```ts
export type BatchReportRow = {
  batch_id: string;
  fingerprint: string;
  report_json: string;
  model: string;
  created_at: number;
  updated_at: number;
};

export async function getBatchReport(batchId: string): Promise<BatchReportRow | undefined> {
  await ready();
  return d1First<BatchReportRow>("SELECT * FROM batch_reports WHERE batch_id = ?", [batchId]);
}

export async function upsertBatchReport(row: BatchReportRow) {
  await ready();
  await d1Run(
    `INSERT INTO batch_reports (batch_id, fingerprint, report_json, model, created_at, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(batch_id) DO UPDATE SET
       fingerprint=excluded.fingerprint,
       report_json=excluded.report_json,
       model=excluded.model,
       updated_at=excluded.updated_at`,
    [row.batch_id, row.fingerprint, row.report_json, row.model, row.created_at, row.updated_at],
  );
}
```

Note: `upsertBatchReport` test expects the INSERT params array only — assert against the bound values list as written above. If the SQL string includes ON CONFLICT, still pass the same six params.

- [ ] **Step 4: Run tests**

Run: `pnpm test src/lib/db.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts migrations/0001_init.sql migrations/0002_batch_reports.sql
git commit -m "Add D1 batch_reports cache table and helpers."
```

---

### Task 4: OpenRouter agent + tools

**Files:**
- Create: `src/lib/report-agent.ts`
- Test: `src/lib/report-agent.test.ts`
- Modify: `package.json` (deps), `env.example`, `README.md`

**Interfaces:**
- Consumes: `getBatch`, `listStages`, `getOrgById`, `toPublicOrg` from db; `STAGES` from stages; `readAttributes` from solana; `batchReportSchema`
- Produces:
  - `DEFAULT_REPORT_MODEL = "openai/gpt-4o-mini"`
  - `generateBatchReport(batchId: string): Promise<{ report: BatchReportData; model: string }>`
  - Throws `Error("OPENROUTER_API_KEY is not configured")` when key missing

- [ ] **Step 1: Install deps**

```bash
pnpm add ai @openrouter/ai-sdk-provider
```

Ensure lockfile resolves `@openrouter/ai-sdk-provider` ≥ 2.6.0. If lower, pin: `pnpm add @openrouter/ai-sdk-provider@^2.6.0`

- [ ] **Step 2: Write failing tests for key gate + tool binding**

```ts
// src/lib/report-agent.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("generateBatchReport", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when OPENROUTER_API_KEY is missing", async () => {
    const { generateBatchReport } = await import("./report-agent");
    await expect(generateBatchReport("ABCD")).rejects.toThrow(/OPENROUTER_API_KEY/);
  });
});
```

- [ ] **Step 3: Run test — expect fail (module missing)**

Run: `pnpm test src/lib/report-agent.test.ts`

Expected: FAIL — cannot find module

- [ ] **Step 4: Implement agent**

```ts
// src/lib/report-agent.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Output, ToolLoopAgent, tool, stepCountIs } from "ai";
import { z } from "zod";
import {
  getBatch,
  getOrgById,
  listStages,
  toPublicOrg,
} from "@/lib/db";
import { STAGES } from "@/lib/stages";
import { readAttributes } from "@/lib/solana";
import { batchReportSchema, type BatchReportData } from "@/lib/report-schema";

export const DEFAULT_REPORT_MODEL = "openai/gpt-4o-mini";

function modelId() {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_REPORT_MODEL;
}

export async function generateBatchReport(
  batchId: string,
): Promise<{ report: BatchReportData; model: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const id = batchId.toUpperCase();
  const openrouter = createOpenRouter({ apiKey });
  const model = modelId();

  const agent = new ToolLoopAgent({
    model: openrouter(model),
    instructions: `You are FoodTrace's product report writer.
Use tools to load the batch. Never invent stages, orgs, hashes, or transactions.
Write consumer-friendly product/journey/trust copy grounded only in tool data.
Keep auditor fields strictly factual.
Include all STAGES in journey (completed or pending).
Return structured output matching the schema.`,
    tools: {
      getBatchContext: tool({
        description: "Load batch row and farmer org public profile for this report's batch only",
        inputSchema: z.object({}),
        execute: async () => {
          const batch = await getBatch(id);
          if (!batch) return { error: "batch not found" };
          const farmer = batch.farmer_org_id
            ? await getOrgById(batch.farmer_org_id)
            : undefined;
          return {
            batch,
            farmerOrg: farmer ? toPublicOrg(farmer) : null,
          };
        },
      }),
      listBatchStages: tool({
        description: "List recorded stages and the canonical stage catalog",
        inputSchema: z.object({}),
        execute: async () => {
          const stages = await listStages(id);
          return { catalog: STAGES, stages };
        },
      }),
      getOrg: tool({
        description: "Load a public org profile by id (no secrets)",
        inputSchema: z.object({ orgId: z.string() }),
        execute: async ({ orgId }) => {
          const org = await getOrgById(orgId);
          if (!org) return { error: "org not found" };
          return { org: toPublicOrg(org) };
        },
      }),
      getChainAttributes: tool({
        description: "Read on-chain NFT attributes for this batch's asset",
        inputSchema: z.object({}),
        execute: async () => {
          const batch = await getBatch(id);
          if (!batch) return { error: "batch not found" };
          try {
            const attrs = await readAttributes(batch.asset);
            return { attrs };
          } catch (e) {
            return {
              error: e instanceof Error ? e.message : String(e),
              attrs: [],
            };
          }
        },
      }),
    },
    output: Output.object({ schema: batchReportSchema }),
    stopWhen: stepCountIs(12),
  });

  const result = await agent.generate({
    prompt: `Generate the product report for batch ${id}. Call tools first, then produce the structured report.`,
  });

  if (!result.output) {
    throw new Error("Agent did not return structured report output");
  }

  return { report: result.output, model };
}
```

If the installed `ai` package types differ slightly (`Output.object` vs `output: { schema }`), match the installed AI SDK docs — prefer `Output.object({ schema: batchReportSchema })`.

- [ ] **Step 5: Run unit test**

Run: `pnpm test src/lib/report-agent.test.ts`

Expected: PASS (missing key throws)

- [ ] **Step 6: Document env**

Append to `env.example`:

```
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
```

Append a short README subsection under Run / env listing these two vars and that `/reports/[batch_id]` uses them.

- [ ] **Step 7: Commit**

```bash
git add src/lib/report-agent.ts src/lib/report-agent.test.ts package.json pnpm-lock.yaml env.example README.md
git commit -m "Add OpenRouter ToolLoopAgent for batch product reports."
```

---

### Task 5: `BatchReport` UI component

**Files:**
- Create: `src/components/BatchReport.tsx`

**Interfaces:**
- Consumes: `BatchReportData`, `explorerUrl` from solana
- Produces: `<BatchReport report={BatchReportData} />` — white PDF-style sheet

- [ ] **Step 1: Implement component** (no separate visual snapshot test required; keep markup testable via structure)

```tsx
// src/components/BatchReport.tsx
import Link from "next/link";
import type { BatchReportData } from "@/lib/report-schema";
import { explorerUrl } from "@/lib/solana";

export function BatchReport({ report }: { report: BatchReportData }) {
  const { product, journey, trust, auditor, generatedAt } = report;
  return (
    <article className="report-sheet mx-auto w-full max-w-[816px] bg-white text-neutral-900 shadow-sm print:shadow-none">
      <header className="border-b border-neutral-200 px-8 py-10 sm:px-12">
        <p className="text-xs tracking-[0.2em] uppercase text-neutral-500">FoodTrace product report</p>
        <h1 className="mt-3 font-[family-name:var(--font-fraunces)] text-3xl sm:text-4xl">{product.title}</h1>
        <p className="mt-2 text-lg text-neutral-600">{product.tagline}</p>
        <p className="mt-4 text-sm text-neutral-500">
          Batch <span className="font-mono">#{auditor.batchId}</span>
          {" · "}
          Generated {new Date(generatedAt).toLocaleString()}
        </p>
      </header>

      <section className="space-y-4 border-b border-neutral-200 px-8 py-8 sm:px-12">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl">Product story</h2>
        {product.originStory.split(/\n\n+/).map((p, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-neutral-800">{p}</p>
        ))}
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-neutral-700">
          {product.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>

      <section className="border-b border-neutral-200 px-8 py-8 sm:px-12">
        <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-xl">Journey</h2>
        <ol className="space-y-4">
          {journey.map((j) => (
            <li key={j.stageId} className={j.status === "pending" ? "opacity-50" : ""}>
              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Stage {j.stageId} · {j.stageLabel} · {j.status}
              </div>
              <div className="font-medium">{j.headline}</div>
              <p className="text-sm text-neutral-700">{j.summary}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-b border-neutral-200 px-8 py-8 sm:px-12">
        <h2 className="mb-2 font-[family-name:var(--font-fraunces)] text-xl">Trust</h2>
        <p className="text-sm text-neutral-800">{trust.verificationSummary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {trust.badges.map((b) => (
            <span key={b} className="border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700">
              {b}
            </span>
          ))}
        </div>
      </section>

      <section className="px-8 py-8 sm:px-12">
        <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-xl">Auditor appendix</h2>
        <dl className="grid gap-2 text-xs sm:grid-cols-[8rem_1fr]">
          <dt className="text-neutral-500">NFT asset</dt>
          <dd>
            <a className="break-all font-mono underline" href={explorerUrl("address", auditor.nftAsset)} target="_blank" rel="noreferrer">
              {auditor.nftAsset}
            </a>
          </dd>
          <dt className="text-neutral-500">Mint tx</dt>
          <dd>
            <a className="break-all font-mono underline" href={explorerUrl("tx", auditor.mintTx)} target="_blank" rel="noreferrer">
              {auditor.mintTx}
            </a>
          </dd>
        </dl>

        {auditor.farmerOrg && (
          <div className="mt-4 text-sm">
            <h3 className="font-medium">Farmer org</h3>
            <p>
              {auditor.farmerOrg.name} ({auditor.farmerOrg.role}) · {auditor.farmerOrg.verificationStatus}
            </p>
            {auditor.farmerOrg.certifications.length > 0 && (
              <p className="text-xs text-neutral-600">
                Certs: {auditor.farmerOrg.certifications.join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-2 pr-2 font-medium">Stage</th>
                <th className="py-2 pr-2 font-medium">Actor</th>
                <th className="py-2 pr-2 font-medium">Photo hash</th>
                <th className="py-2 pr-2 font-medium">Tx</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {auditor.stages.map((s) => (
                <tr key={s.stageId} className="border-b border-neutral-100 align-top">
                  <td className="py-2 pr-2">{s.stageId}. {s.label}</td>
                  <td className="py-2 pr-2">
                    {s.actor}
                    {s.actorOrg ? ` (${s.actorOrg.name})` : ""}
                  </td>
                  <td className="py-2 pr-2 font-mono break-all">{s.photoHash}</td>
                  <td className="py-2 pr-2">
                    <a className="font-mono underline" href={explorerUrl("tx", s.txSig)} target="_blank" rel="noreferrer">
                      {s.txSig.slice(0, 12)}…
                    </a>
                  </td>
                  <td className="py-2">{s.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {auditor.integrityNotes.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-neutral-600">
            {auditor.integrityNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-neutral-200 px-8 py-6 text-center text-xs text-neutral-500 sm:px-12 print:hidden">
        <Link href={`/verify/${auditor.batchId}`} className="underline">
          Open verify page
        </Link>
        {" · "}
        FoodTrace
      </footer>
    </article>
  );
}
```

Add print helper in `src/app/globals.css` (minimal):

```css
@media print {
  body > header,
  .print\:hidden {
    display: none !important;
  }
  body {
    background: white !important;
  }
  main {
    max-width: none !important;
    padding: 0 !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BatchReport.tsx src/app/globals.css
git commit -m "Add white PDF-style BatchReport renderer."
```

---

### Task 6: `/reports/[batch_id]` page + loading

**Files:**
- Create: `src/app/reports/[batch_id]/page.tsx`
- Create: `src/app/reports/[batch_id]/loading.tsx`
- Create (optional helper): `src/lib/report-service.ts` — keep page thin

**Interfaces:**
- Produces: `loadOrGenerateReport(batchId: string, opts: { refresh: boolean }): Promise<{ report: BatchReportData; cached: boolean; model: string } | { error: string }>`

- [ ] **Step 1: Implement service**

```ts
// src/lib/report-service.ts
import {
  getBatch,
  getBatchReport,
  getOrgById,
  listStages,
  toPublicOrg,
  upsertBatchReport,
  type PublicOrg,
} from "@/lib/db";
import { buildReportFingerprint } from "@/lib/report-fingerprint";
import { generateBatchReport } from "@/lib/report-agent";
import { parseBatchReport, type BatchReportData } from "@/lib/report-schema";

async function relatedOrgs(batchId: string, farmerOrgId: string | null): Promise<PublicOrg[]> {
  const stages = await listStages(batchId);
  const ids = new Set<string>();
  if (farmerOrgId) ids.add(farmerOrgId);
  for (const s of stages) {
    if (s.actor_org_id) ids.add(s.actor_org_id);
  }
  const orgs: PublicOrg[] = [];
  for (const id of ids) {
    const row = await getOrgById(id);
    if (row) orgs.push(toPublicOrg(row));
  }
  return orgs;
}

export async function loadOrGenerateReport(
  batchId: string,
  opts: { refresh: boolean },
): Promise<
  | { ok: true; report: BatchReportData; cached: boolean; model: string }
  | { ok: false; error: string }
> {
  const id = batchId.toUpperCase();
  const batch = await getBatch(id);
  if (!batch) return { ok: false, error: "not_found" };

  const stages = await listStages(id);
  const orgs = await relatedOrgs(id, batch.farmer_org_id);
  const fingerprint = buildReportFingerprint({ batch, stages, orgs });

  if (!opts.refresh) {
    const cached = await getBatchReport(id);
    if (cached && cached.fingerprint === fingerprint) {
      try {
        return {
          ok: true,
          report: parseBatchReport(cached.report_json),
          cached: true,
          model: cached.model,
        };
      } catch {
        // fall through to regenerate
      }
    }
  }

  try {
    const { report, model } = await generateBatchReport(id);
    const now = Date.now();
    const existing = await getBatchReport(id);
    await upsertBatchReport({
      batch_id: id,
      fingerprint,
      report_json: JSON.stringify(report),
      model,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    return { ok: true, report, cached: false, model };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
```

- [ ] **Step 2: Implement page**

```tsx
// src/app/reports/[batch_id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchReport } from "@/components/BatchReport";
import { getBatch } from "@/lib/db";
import { loadOrGenerateReport } from "@/lib/report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ batch_id: string }>;
  searchParams: Promise<{ refresh?: string }>;
}) {
  const { batch_id } = await params;
  const sp = await searchParams;
  const id = batch_id.toUpperCase();
  const batch = await getBatch(id);
  if (!batch) notFound();

  const result = await loadOrGenerateReport(id, { refresh: sp.refresh === "1" });

  if (!result.ok) {
    return (
      <div className="space-y-4 rounded-2xl border border-cream-300 bg-cream-50 p-6">
        <h1 className="text-lg font-semibold">Could not generate report</h1>
        <p className="text-sm text-cream-700">{result.error}</p>
        <p className="text-sm">
          <Link className="underline" href={`/reports/${id}?refresh=1`}>
            Retry
          </Link>
          {" · "}
          <Link className="underline" href={`/verify/${id}`}>
            Verify page
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden text-xs text-cream-700">
        <Link href={`/verify/${id}`} className="underline">
          ← verify
        </Link>
        <span>
          {result.cached ? "Cached report" : "Freshly generated"} · {result.model}{" "}
          <Link className="underline" href={`/reports/${id}?refresh=1`}>
            Regenerate
          </Link>
        </span>
      </div>
      <BatchReport report={result.report} />
    </div>
  );
}
```

```tsx
// src/app/reports/[batch_id]/loading.tsx
export default function Loading() {
  return (
    <div className="mx-auto max-w-[816px] animate-pulse space-y-4 bg-white p-10 shadow-sm">
      <div className="h-4 w-40 bg-neutral-200" />
      <div className="h-10 w-3/4 bg-neutral-200" />
      <div className="h-4 w-full bg-neutral-100" />
      <div className="h-4 w-5/6 bg-neutral-100" />
      <p className="pt-6 text-sm text-neutral-500">Generating product report…</p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/report-service.ts src/app/reports/
git commit -m "Add public reports page with fingerprint cache."
```

---

### Task 7: Discovery links

**Files:**
- Modify: `src/app/HomeDashboard.tsx` (batch list row)
- Modify: `src/app/verify/[id]/page.tsx`

- [ ] **Step 1: Dashboard link**

In the batch list item actions area (near stage dots), add:

```tsx
<Link
  href={`/reports/${b.id}`}
  className="text-xs text-forest-800 underline dark:text-olive-300"
>
  Report
</Link>
```

- [ ] **Step 2: Verify page link**

Near the header / ProductQr area, add:

```tsx
<p className="mt-3 text-sm">
  <Link href={`/reports/${batch.id}`} className="text-forest-800 underline dark:text-olive-300">
    Product report
  </Link>
</p>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/HomeDashboard.tsx src/app/verify/[id]/page.tsx
git commit -m "Link dashboard and verify pages to product reports."
```

---

### Task 8: Manual verification + test suite

- [ ] **Step 1: Run full unit suite**

Run: `pnpm test`

Expected: all PASS

- [ ] **Step 2: Manual smoke (requires `OPENROUTER_API_KEY` in `.env.local`)**

1. `pnpm dev`
2. Open `/reports/<existing-batch-id>` — first load generates; toolbar shows “Freshly generated”
3. Reload same URL — “Cached report”, no new OpenRouter spend (or much faster)
4. Record a new stage for that batch, reopen report — regenerates
5. Open `?refresh=1` — forces regenerate
6. Print preview — chrome hidden, white sheet remains

- [ ] **Step 3: Final commit if any fixes**

Only if smoke testing required code fixes.

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Public `/reports/[batch_id]` | 6 |
| Fingerprint cache until inputs change | 2, 3, 6 |
| `?refresh=1` | 6 |
| OpenRouter + AI SDK agent + tools | 4 |
| Structured JSON schema | 1 |
| White PDF-style UI + auditor appendix | 5 |
| Dashboard + verify links | 7 |
| Env docs | 4 |
| Tests (schema, fingerprint, cache) | 1–4, 8 |
| D1 storage (design said SQLite; codebase is D1) | 3 |
| Out of scope respected | — |

## Type consistency notes

- `BatchReportData` from Task 1 is the single report type used by agent output, cache parse, and UI.
- `BatchReportRow` is the D1 cache row; `report_json` is stringified `BatchReportData`.
- `buildReportFingerprint` input uses `PublicOrg[]` (password stripped).
- Page param is `batch_id`; normalize with `.toUpperCase()` everywhere.
