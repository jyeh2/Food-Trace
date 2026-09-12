import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getOrgByEmail, insertOrg, listOrgs, toPublicOrg, type OrgRow } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { ORG_ROLES, type OrgRole } from "@/lib/orgs";

export const runtime = "nodejs";

function newOrgId() {
  return randomBytes(6).toString("hex");
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}

export async function GET() {
  return NextResponse.json({ orgs: (await listOrgs()).map(toPublicOrg) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const role = String(body.role ?? "") as OrgRole;
  const contact_email = String(body.contact_email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!name || !contact_email || password.length < 8) {
    return NextResponse.json(
      { error: "name, contact_email, and password (min 8 chars) are required" },
      { status: 400 },
    );
  }
  if (!ORG_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of ${ORG_ROLES.join(", ")}` },
      { status: 400 },
    );
  }
  if (await getOrgByEmail(contact_email)) {
    return NextResponse.json({ error: "an org with that email already exists" }, { status: 409 });
  }

  const row: OrgRow = {
    id: newOrgId(),
    name,
    role,
    public_key: str(body.public_key),
    contact_email,
    phone: str(body.phone),
    password_hash: hashPassword(password),
    location_lat: num(body.location_lat),
    location_lng: num(body.location_lng),
    grid_region: str(body.grid_region),
    certifications: JSON.stringify(Array.isArray(body.certifications) ? body.certifications : []),
    verification_status: "unverified",
    active: 1,
    created_at: Date.now(),

    farm_type: str(body.farm_type),
    livestock_type: str(body.livestock_type),
    breed: str(body.breed),
    herd_size: num(body.herd_size),
    avg_weight_kg: num(body.avg_weight_kg),
    feed_type: str(body.feed_type),
    feed_source: str(body.feed_source),
    land_area_hectares: num(body.land_area_hectares),
    land_use_type: str(body.land_use_type),
    farming_practice: str(body.farming_practice),
    onsite_renewable_pct: num(body.onsite_renewable_pct),

    facility_type: str(body.facility_type),
    facility_energy_source: str(body.facility_energy_source),
    facility_renewable_pct: num(body.facility_renewable_pct),
    fleet_type: str(body.fleet_type),
    refrigeration_type: str(body.refrigeration_type),
    processing_capacity_kg_per_day: num(body.processing_capacity_kg_per_day),
    default_transport_mode: str(body.default_transport_mode),

    buyer_type: str(body.buyer_type),
    storage_type: str(body.storage_type),
    avg_storage_duration_days: num(body.avg_storage_duration_days),
    cooking_method: str(body.cooking_method),
    kitchen_energy_source: str(body.kitchen_energy_source),
    sustainability_program: str(body.sustainability_program),
  };

  await insertOrg(row);
  return NextResponse.json({ org: toPublicOrg(row) }, { status: 201 });
}
