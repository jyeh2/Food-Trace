import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { Output, ToolLoopAgent, tool, stepCountIs } from "ai";
import { z } from "zod";
import {
  getBatch,
  getOrgById,
  listStages,
  toPublicOrg,
} from "./db";
import { STAGES } from "./stages";
import { readAttributes } from "./solana";
import { batchReportSchema, type BatchReportData } from "./report-schema";

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
