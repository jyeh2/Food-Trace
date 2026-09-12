export type OrgRole = "FARMER" | "PROCESSOR" | "DISTRIBUTOR" | "BUYER" | "SUPPLIER" | "ADMIN" | "AUDITOR";

export const ORG_ROLES: OrgRole[] = ["FARMER", "PROCESSOR", "DISTRIBUTOR", "BUYER", "SUPPLIER", "ADMIN", "AUDITOR"];

/** The four roles anyone can self-register as, one per pipeline stage. ADMIN/AUDITOR are provisioned separately. */
export const QUICK_ROLES: OrgRole[] = ["FARMER", "PROCESSOR", "DISTRIBUTOR", "BUYER"];

/**
 * "BUYER" is the internal/DB name (matches stage 4 = retail); "Retailer" reads better in the UI.
 * "SUPPLIER" predates splitting stages 2/3 into separate PROCESSOR/DISTRIBUTOR roles — kept only
 * so orgs registered before the split keep working; no longer offered at registration.
 */
export const ROLE_LABELS: Record<OrgRole, string> = {
  FARMER: "Farmer",
  PROCESSOR: "Processor",
  DISTRIBUTOR: "Distributor",
  BUYER: "Retailer",
  SUPPLIER: "Supplier (legacy)",
  ADMIN: "Admin",
  AUDITOR: "Auditor",
};

/** Which pipeline stage ids (see lib/stages.ts) each role is allowed to record on-chain. */
export const ROLE_STAGES: Record<OrgRole, number[]> = {
  FARMER: [1],
  PROCESSOR: [2],
  DISTRIBUTOR: [3],
  BUYER: [4],
  SUPPLIER: [2, 3],
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
