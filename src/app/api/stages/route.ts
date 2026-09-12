import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { UPLOAD_DIR, getBatch, insertStage, lastStage, snapshotOrgForStage } from "@/lib/db";
import { nextAllowedStage, stageById } from "@/lib/stages";
import { verifyStationCode } from "@/lib/totp";
import { recordStageOnChain } from "@/lib/solana";
import { getSessionOrg } from "@/lib/auth";
import { ROLE_LABELS, roleCanRecordStage } from "@/lib/orgs";

export const runtime = "nodejs";

const SECRET = process.env.STATION_SECRET ?? "dev-station-secret-change-me";

export async function POST(req: Request) {
  const org = await getSessionOrg();
  if (!org) {
    return NextResponse.json({ error: "log in as an org to record a stage" }, { status: 401 });
  }

  const form = await req.formData();
  const batchId = String(form.get("batchId") ?? "").trim().toUpperCase();
  const stage = Number(form.get("stage"));
  const code = String(form.get("code") ?? "");
  const note = String(form.get("note") ?? "").slice(0, 200);
  const actor = org.name;
  const photo = form.get("photo");

  if (!stageById(stage)) {
    return NextResponse.json({ error: "unknown stage" }, { status: 400 });
  }
  if (!roleCanRecordStage(org.role, stage)) {
    return NextResponse.json(
      { error: `${ROLE_LABELS[org.role]} orgs cannot record stage ${stage}` },
      { status: 403 },
    );
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
  const orgSnapshot = snapshotOrgForStage(org);
  const orgSnapshotJson = JSON.stringify(orgSnapshot);
  const snapshotHash = createHash("sha256").update(orgSnapshotJson).digest("hex");

  try {
    const { signature } = await recordStageOnChain({
      asset: batch.asset,
      stage,
      photoHash,
      ts,
      actor,
      snapshotHash,
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
      actor_org_id: org.id,
      org_snapshot: orgSnapshotJson,
    };
    insertStage(row);
    return NextResponse.json({ stage: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `chain write failed: ${msg}` }, { status: 502 });
  }
}
