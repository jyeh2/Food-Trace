import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { insertBatch, listBatches, lastStage, updateOrgLocation } from "@/lib/db";
import { mintBatchNft } from "@/lib/solana";
import { getSessionOrg } from "@/lib/auth";
import { ROLE_LABELS, roleCanMintBatch } from "@/lib/orgs";

export const runtime = "nodejs";

function newBatchId() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function GET() {
  const org = await getSessionOrg();
  if (!org) {
    return NextResponse.json({ error: "log in to view batches" }, { status: 401 });
  }
  const batches = await Promise.all(
    (await listBatches()).map(async (b) => ({
      ...b,
      last_stage: await lastStage(b.id),
    })),
  );
  return NextResponse.json({ batches });
}

export async function POST(req: Request) {
  const org = await getSessionOrg();
  if (!org) {
    return NextResponse.json({ error: "log in as a farmer org to mint a batch" }, { status: 401 });
  }
  if (!roleCanMintBatch(org.role)) {
    return NextResponse.json({ error: `${ROLE_LABELS[org.role]} orgs cannot mint batches` }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    origin?: string;
    location_lat?: number;
    location_lng?: number;
  };
  const name = body.name?.trim();
  const origin = body.origin?.trim();
  const locationLat = Number(body.location_lat);
  const locationLng = Number(body.location_lng);
  if (
    !name ||
    !origin ||
    !Number.isFinite(locationLat) ||
    !Number.isFinite(locationLng) ||
    locationLat < -90 ||
    locationLat > 90 ||
    locationLng < -180 ||
    locationLng > 180
  ) {
    return NextResponse.json({ error: "product and a valid current or demo location are required" }, { status: 400 });
  }
  const id = newBatchId();
  try {
    await updateOrgLocation(org.id, locationLat, locationLng, origin);
    const { asset, signature } = await mintBatchNft({ batchId: id, name, origin });
    const row = {
      id,
      name,
      origin,
      asset,
      mint_sig: signature,
      created_at: Date.now(),
      farmer_org_id: org.id,
    };
    await insertBatch(row);
    return NextResponse.json({ batch: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `mint failed: ${msg}` }, { status: 502 });
  }
}
