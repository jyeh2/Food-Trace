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
    // OpenAI strict JSON schema requires every property key in `required`
    // (no `.optional()`). Use empty string when location is unknown.
    farmerOrg: z
      .object({
        name: z.string(),
        role: z.string(),
        certifications: z.array(z.string()),
        verificationStatus: z.string(),
        location: z.string(),
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
