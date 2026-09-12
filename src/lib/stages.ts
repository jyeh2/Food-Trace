export const STAGES = [
  { id: 1, key: "farm", label: "Farm / Harvest" },
  { id: 2, key: "processing", label: "Processing" },
  { id: 3, key: "distribution", label: "Distribution" },
  { id: 4, key: "retail", label: "Retail" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export function stageById(id: number) {
  return STAGES.find((s) => s.id === id);
}

/** Stages must be recorded strictly in order: next allowed = last + 1. */
export function nextAllowedStage(lastRecorded: number): number | null {
  const next = lastRecorded + 1;
  return next <= STAGES.length ? next : null;
}
