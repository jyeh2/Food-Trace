import type { BatchRow, StageRow } from "./db";
import { STAGES } from "./stages";

export type TraceData = {
  batch: BatchRow | null;
  chainErr: string;
  assetUrl?: string;
  mintUrl?: string;
  rows: {
    s: (typeof STAGES)[number];
    row: StageRow | undefined;
    parsed: { photoHash: string; ts: number; actor: string } | null;
    fileHash: string | null;
    match: boolean;
    photoUrl?: string;
    txUrl?: string;
  }[];
};

export const TRACE_SCENARIOS = [
  { id: "empty", label: "No product data", count: 0 },
  { id: "registered", label: "Product registered · No stages yet", count: 0 },
  ...STAGES.map((s) => ({ id: `through-${s.id}`, label: `Recorded through ${s.label}`, count: s.id })),
  ...STAGES.map((s) => ({ id: `error-${s.id}`, label: `${s.label} · Photo mismatch`, count: s.id, error: s.id })),
  { id: "missing-photo", label: "Processing · Missing photo", count: 2 },
  { id: "missing-chain", label: "Processing · Missing blockchain record", count: 2 },
  { id: "chain-offline", label: "Blockchain unavailable", count: 4 },
];

// Pure, deterministic fixtures: no API calls, storage, wallet or database runtime imports.
export function createTracePreview(id: string): TraceData {
  const scenario = TRACE_SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`Unknown trace scenario: ${id}`);
  const createdAt = Date.UTC(2026, 8, 10, 9);
  const actors = ["Demo Green Valley Farm", "Demo Fresh Processing", "Demo Cold Chain Logistics", "Demo Community Market"];
  const notes = ["Harvested and packed at the farm.", "Washed, sorted and quality checked.", "Transported in refrigerated storage at 4°C.", "Received and stocked for customers."];
  return {
    batch: id === "empty" ? null : {
      id: "MOCK-DEMO", name: "Demo · Organic Tomatoes", origin: "Green Valley Demo Farm",
      asset: "Simulated NFT · no on-chain asset", mint_sig: "Simulated transaction",
      created_at: createdAt, farmer_org_id: null,
    },
    chainErr: id === "chain-offline" ? "Simulated RPC connection failure. Unable to read blockchain records." : "",
    rows: STAGES.map((s, i) => {
      const hash = String(s.id).repeat(64);
      const recorded = s.id <= scenario.count && id !== "empty";
      const missingPhoto = id === "missing-photo" && s.id === 2;
      const failed = "error" in scenario && scenario.error === s.id;
      const fileHash = recorded && !missingPhoto ? (failed ? "f".repeat(64) : hash) : null;
      const created_at = createdAt + i * 86400000;
      const parsed = recorded && id !== "chain-offline" && !(id === "missing-chain" && s.id === 2)
        ? { photoHash: hash, ts: created_at, actor: actors[i] } : null;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320"><rect width="560" height="320" fill="#dbe5cf"/><circle cx="280" cy="110" r="48" fill="#45633a"/><text x="280" y="126" text-anchor="middle" fill="white" font-size="42">${s.id}</text><text x="280" y="205" text-anchor="middle" fill="#263b22" font-size="26">${s.label}</text><text x="280" y="250" text-anchor="middle" fill="#45633a" font-size="18">MOCK PHOTO · DEBUG ONLY</text></svg>`;
      return {
        s, row: recorded ? { id: s.id, batch_id: "MOCK-DEMO", stage: s.id, photo_file: "", photo_hash: hash,
          note: failed ? `${notes[i]} Simulated integrity error: stored photo differs from the on-chain hash.` : notes[i],
          actor: actors[i], tx_sig: "", created_at, actor_org_id: null } : undefined,
        parsed, fileHash, match: recorded && !!parsed && fileHash === parsed.photoHash,
        photoUrl: recorded && !missingPhoto ? `data:image/svg+xml,${encodeURIComponent(svg)}` : undefined,
      };
    }),
  };
}
