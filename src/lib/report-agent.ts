import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, Output, tool, stepCountIs } from "ai";
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
export const REPORT_TEMPERATURE = 0.7;

function modelId() {
  return process.env.IFM_MODEL?.trim() || DEFAULT_REPORT_MODEL;
}

export function requireIfmApiKey(): string {
  const apiKey = process.env.IFM_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("IFM_API_KEY is not configured");
  }
  return apiKey;
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

function reportTools(id: string) {
  return {
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
  };
}

const SYSTEM = `You are FoodTrace's product report writer.
Never invent stages, orgs, hashes, or transactions beyond the provided data.
Write consumer-friendly product/journey/trust copy grounded only in that data.
Keep auditor fields strictly factual.
Include every catalog stage in journey (completed or pending).
If farmerOrg has no location, set location to "".
Set generatedAt to an ISO timestamp.`;

async function buildCall(batchId: string) {
  const apiKey = requireIfmApiKey();
  const id = batchId.toUpperCase();
  const ifm = createOpenAI({
    apiKey,
    baseURL: IFM_BASE_URL,
    name: "ifm",
  });
  const model = modelId();
  const context = await loadReportContext(id);
  return {
    id,
    model,
    modelInstance: ifm.chat(model),
    system: SYSTEM,
    prompt: `Generate the structured product report for batch ${id}.

Batch context (JSON):
${JSON.stringify(context, null, 2)}

You may call tools to double-check, then return the structured report object.`,
    tools: reportTools(id),
    temperature: REPORT_TEMPERATURE,
    output: Output.object({ schema: batchReportSchema }),
    stopWhen: stepCountIs(12),
  };
}

export async function generateBatchReport(
  batchId: string,
): Promise<{ report: BatchReportData; model: string }> {
  const call = await buildCall(batchId);
  const result = await generateText({
    model: call.modelInstance,
    system: call.system,
    prompt: call.prompt,
    tools: call.tools,
    temperature: call.temperature,
    output: call.output,
    stopWhen: call.stopWhen,
  });

  if (!result.output) {
    throw new Error(
      `No structured report output (finishReason=${result.finishReason}, text=${(result.text ?? "").slice(0, 200)})`,
    );
  }

  return { report: result.output, model: call.model };
}

export async function streamBatchReport(batchId: string, abortSignal?: AbortSignal) {
  const call = await buildCall(batchId);
  const result = streamText({
    model: call.modelInstance,
    system: call.system,
    prompt: call.prompt,
    tools: call.tools,
    temperature: call.temperature,
    output: call.output,
    stopWhen: call.stopWhen,
    abortSignal,
  });
  return { result, model: call.model, batchId: call.id };
}
