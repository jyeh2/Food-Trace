import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, tool, stepCountIs } from "ai";
import { z } from "zod";
import {
  getBatch,
  getOrgById,
  listStages,
  toPublicOrg,
  type PublicOrg,
} from "./db";
import { STAGES } from "./stages";
import { readAttributes } from "./solana";
import { batchReportSchema, type BatchReportData } from "./report-schema";

export const DEFAULT_REPORT_MODEL = "IFM/K2-Horizon-375B-A23B";
export const IFM_BASE_URL = "https://api.ifm.ai/v1";

function modelId() {
  return process.env.IFM_MODEL?.trim() || DEFAULT_REPORT_MODEL;
}

async function loadReportContext(id: string) {
  const batch = await getBatch(id);
  if (!batch) throw new Error(`batch ${id} not found`);

  const stages = await listStages(id);
  const orgIds = new Set<string>();
  if (batch.farmer_org_id) orgIds.add(batch.farmer_org_id);
  for (const s of stages) {
    if (s.actor_org_id) orgIds.add(s.actor_org_id);
  }
  const orgs: PublicOrg[] = [];
  for (const orgId of orgIds) {
    const row = await getOrgById(orgId);
    if (row) orgs.push(toPublicOrg(row));
  }

  let chainAttrs: { key: string; value: string }[] = [];
  let chainError = "";
  try {
    chainAttrs = await readAttributes(batch.asset);
  } catch (e) {
    chainError = e instanceof Error ? e.message : String(e);
  }

  return {
    batch,
    stages,
    catalog: STAGES,
    orgs,
    chainAttrs,
    chainError: chainError || null,
  };
}

export async function generateBatchReport(
  batchId: string,
): Promise<{ report: BatchReportData; model: string }> {
  const apiKey = process.env.IFM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("IFM_API_KEY is not configured");
  }

  const id = batchId.toUpperCase();
  const ifm = createOpenAI({
    apiKey,
    baseURL: IFM_BASE_URL,
    name: "ifm",
  });
  const model = modelId();
  const context = await loadReportContext(id);

  // Tools stay available for the agent loop; context is also inlined so the
  // model can emit structured output even if it skips tool calls.
  const result = await generateText({
    model: ifm.chat(model),
    system: `You are FoodTrace's product report writer.
Never invent stages, orgs, hashes, or transactions beyond the provided data.
Write consumer-friendly product/journey/trust copy grounded only in that data.
Keep auditor fields strictly factual.
Include every catalog stage in journey (completed or pending).
If farmerOrg has no location, set location to "".
Set generatedAt to an ISO timestamp.`,
    prompt: `Generate the structured product report for batch ${id}.

Batch context (JSON):
${JSON.stringify(context, null, 2)}

You may call tools to double-check, then return the structured report object.`,
    tools: {
      getBatchContext: tool({
        description: "Reload batch row and farmer org public profile",
        inputSchema: z.object({
          reason: z.string().describe("Why you are reloading"),
        }),
        execute: async () => {
          const batch = await getBatch(id);
          if (!batch) return { error: "batch not found" };
          const farmer = batch.farmer_org_id
            ? await getOrgById(batch.farmer_org_id)
            : undefined;
          return { batch, farmerOrg: farmer ? toPublicOrg(farmer) : null };
        },
      }),
      listBatchStages: tool({
        description: "Reload recorded stages and stage catalog",
        inputSchema: z.object({
          reason: z.string().describe("Why you are reloading"),
        }),
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
        description: "Read on-chain NFT attributes for this batch asset",
        inputSchema: z.object({
          reason: z.string().describe("Why you are reading chain state"),
        }),
        execute: async () => {
          const batch = await getBatch(id);
          if (!batch) return { error: "batch not found" };
          try {
            return { attrs: await readAttributes(batch.asset) };
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

  if (!result.output) {
    throw new Error(
      `No structured report output (finishReason=${result.finishReason}, text=${(result.text ?? "").slice(0, 200)})`,
    );
  }

  return { report: result.output, model };
}
