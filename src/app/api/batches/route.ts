import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { insertBatch, listBatches, lastStage } from "@/lib/db";
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
  const batches = listBatches().map((b) => ({
    ...b,
    last_stage: lastStage(b.id),
  }));
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
  };
  const name = body.name?.trim();
  const origin = body.origin?.trim();
  if (!name || !origin) {
    return NextResponse.json({ error: "name and origin required" }, { status: 400 });
  }
  const id = newBatchId();
  try {
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
    insertBatch(row);
    return NextResponse.json({ batch: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `mint failed: ${msg}` }, { status: 502 });
  }
}
