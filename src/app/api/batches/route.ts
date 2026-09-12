import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { insertBatch, listBatches, lastStage } from "@/lib/db";
import { mintBatchNft } from "@/lib/solana";

export const runtime = "nodejs";

function newBatchId() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function GET() {
  const batches = listBatches().map((b) => ({
    ...b,
    last_stage: lastStage(b.id),
  }));
  return NextResponse.json({ batches });
}

export async function POST(req: Request) {
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
    };
    insertBatch(row);
    return NextResponse.json({ batch: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `mint failed: ${msg}` }, { status: 502 });
  }
}
