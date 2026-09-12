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
