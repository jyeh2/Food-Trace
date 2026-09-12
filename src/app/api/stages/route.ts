import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { UPLOAD_DIR, getBatch, insertStage, lastStage } from "@/lib/db";
import { nextAllowedStage, stageById } from "@/lib/stages";
import { verifyStationCode } from "@/lib/totp";
import { recordStageOnChain } from "@/lib/solana";

export const runtime = "nodejs";

const SECRET = process.env.STATION_SECRET ?? "dev-station-secret-change-me";

export async function POST(req: Request) {
  const form = await req.formData();
  const batchId = String(form.get("batchId") ?? "").trim().toUpperCase();
  const stage = Number(form.get("stage"));
  const code = String(form.get("code") ?? "");
  const note = String(form.get("note") ?? "").slice(0, 200);
  const actor = String(form.get("actor") ?? "station").slice(0, 40);
  const photo = form.get("photo");

  if (!stageById(stage)) {
    return NextResponse.json({ error: "unknown stage" }, { status: 400 });
  }
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "photo required" }, { status: 400 });
  }
  const batch = getBatch(batchId);
  if (!batch) {
    return NextResponse.json({ error: "unknown batch" }, { status: 404 });
  }
  if (!verifyStationCode(SECRET, stage, code)) {
    return NextResponse.json(
      { error: "station code invalid or expired — rescan the station QR" },
      { status: 401 },
    );
  }
  const expected = nextAllowedStage(lastStage(batchId));
  if (expected !== stage) {
    return NextResponse.json(
      {
        error:
          expected === null
            ? "batch already completed all stages"
            : `out of order: next expected stage is ${expected}`,
      },
      { status: 409 },
    );
  }

  const bytes = Buffer.from(await photo.arrayBuffer());
  const photoHash = createHash("sha256").update(bytes).digest("hex");
  const ext = photo.type === "image/png" ? "png" : "jpg";
  const photoFile = `${batchId}-s${stage}-${randomBytes(3).toString("hex")}.${ext}`;
  const ts = Date.now();

  try {
    const { signature } = await recordStageOnChain({
      asset: batch.asset,
      stage,
      photoHash,
      ts,
      actor,
    });
    writeFileSync(path.join(UPLOAD_DIR, photoFile), bytes);
    const row = {
      batch_id: batchId,
      stage,
      photo_file: photoFile,
      photo_hash: photoHash,
      note,
      actor,
      tx_sig: signature,
      created_at: ts,
    };
    insertStage(row);
    return NextResponse.json({ stage: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `chain write failed: ${msg}` }, { status: 502 });
  }
}
