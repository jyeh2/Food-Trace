export type OrgRole = "FARMER" | "SUPPLIER" | "BUYER" | "ADMIN" | "AUDITOR";

export const ORG_ROLES: OrgRole[] = ["FARMER", "SUPPLIER", "BUYER", "ADMIN", "AUDITOR"];

/** The three roles anyone can self-register as. ADMIN/AUDITOR are provisioned separately. */
export const QUICK_ROLES: OrgRole[] = ["FARMER", "SUPPLIER", "BUYER"];

/** "BUYER" is the internal/DB name (matches stage 4 = retail); "Consumer" reads better in the UI. */
export const ROLE_LABELS: Record<OrgRole, string> = {
  FARMER: "Farmer",
  SUPPLIER: "Supplier",
  BUYER: "Consumer",
  ADMIN: "Admin",
  AUDITOR: "Auditor",
};

/** Which pipeline stage ids (see lib/stages.ts) each role is allowed to record on-chain. */
export const ROLE_STAGES: Record<OrgRole, number[]> = {
  FARMER: [1],
  SUPPLIER: [2, 3],
  BUYER: [4],
  ADMIN: [1, 2, 3, 4],
  AUDITOR: [],
};

export function roleCanRecordStage(role: OrgRole, stage: number): boolean {
  return ROLE_STAGES[role]?.includes(stage) ?? false;
}

/** Only farmers (or admins, for demo/ops convenience) mint the genesis batch NFT. */
export function roleCanMintBatch(role: OrgRole): boolean {
  return role === "FARMER" || role === "ADMIN";
}
