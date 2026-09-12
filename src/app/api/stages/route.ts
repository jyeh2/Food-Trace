import { after, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import {
  completeStageLocal,
  getBatch,
  getStage,
  insertStage,
  lastStage,
  snapshotOrgForStage,
  updateStageTxSig,
  type StageRow,
} from "@/lib/db";
import { putImage } from "@/lib/r2";
import { nextAllowedStage, stageById } from "@/lib/stages";
import { verifyStationCode } from "@/lib/totp";
import { parseStageValue, readAttributes, recordStageOnChain, stageKey } from "@/lib/solana";
import { getSessionOrg } from "@/lib/auth";
import { ROLE_LABELS, roleCanRecordStage } from "@/lib/orgs";

export const runtime = "nodejs";
/** Solana confirm can exceed default Worker budgets; keep the isolate alive for after(). */
export const maxDuration = 60;

const SECRET = process.env.STATION_SECRET ?? "dev-station-secret-change-me";

export const TX_PENDING = "pending";

export function isStageTxPending(tx: string) {
  return tx === TX_PENDING || tx.startsWith("pending:");
}

export function isStageTxFailed(tx: string) {
  return tx.startsWith("failed:");
}

function stageStatus(row: StageRow) {
  if (isStageTxPending(row.tx_sig)) return "pending" as const;
  if (isStageTxFailed(row.tx_sig)) return "failed" as const;
  return "confirmed" as const;
}

async function runInBackground(work: () => Promise<void>) {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(work());
  } catch {
    after(() => work());
  }
}

export async function GET(req: Request) {
  const org = await getSessionOrg();
  if (!org) {
    return NextResponse.json({ error: "log in to view stage status" }, { status: 401 });
  }
  const url = new URL(req.url);
  const batchId = String(url.searchParams.get("batchId") ?? "").trim().toUpperCase();
  const stage = Number(url.searchParams.get("stage"));
  if (!batchId || !stageById(stage)) {
    return NextResponse.json({ error: "batchId and stage required" }, { status: 400 });
  }
  const row = await getStage(batchId, stage);
  if (!row) {
    return NextResponse.json({ error: "stage not found" }, { status: 404 });
  }
  return NextResponse.json({ stage: row, status: stageStatus(row) });
}

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
  const rawLocationLat = form.get("locationLat");
  const rawLocationLng = form.get("locationLng");
  const locationLat = typeof rawLocationLat === "string" && rawLocationLat.trim()
    ? Number(rawLocationLat)
    : Number.NaN;
  const locationLng = typeof rawLocationLng === "string" && rawLocationLng.trim()
    ? Number(rawLocationLng)
    : Number.NaN;
  const locationLabel = String(form.get("locationLabel") ?? "").trim().slice(0, 120);
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
  if (
    !Number.isFinite(locationLat) ||
    !Number.isFinite(locationLng) ||
    locationLat < -90 ||
    locationLat > 90 ||
    locationLng < -180 ||
    locationLng > 180 ||
    !locationLabel
  ) {
    return NextResponse.json({ error: "a valid current or demo location is required" }, { status: 400 });
  }
  const batch = await getBatch(batchId);
  if (!batch) {
    return NextResponse.json({ error: "unknown batch" }, { status: 404 });
  }
  if (!verifyStationCode(SECRET, stage, code)) {
    return NextResponse.json(
      { error: "station code invalid or expired — rescan the station QR" },
      { status: 401 },
    );
  }

  const existing = await getStage(batchId, stage);
  if (existing && isStageTxPending(existing.tx_sig)) {
    return NextResponse.json(
      { stage: existing, status: "pending" as const },
      { status: 202 },
    );
  }

  const incompleteLocal = !!existing && !existing.photo_file;
  const failedLocal = !!existing && isStageTxFailed(existing.tx_sig);
  const expected = nextAllowedStage(await lastStage(batchId));
  if (expected !== stage && !incompleteLocal && !failedLocal) {
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
  const orgSnapshot = {
    ...snapshotOrgForStage(org),
    grid_region: locationLabel,
    location_lat: locationLat,
    location_lng: locationLng,
  };
  const orgSnapshotJson = JSON.stringify(orgSnapshot);
  const snapshotHash = createHash("sha256").update(orgSnapshotJson).digest("hex");
  const contentType = photo.type === "image/png" ? "image/png" : "image/jpeg";

  try {
    // Photo-only backfill for orphaned chain writes (sync — no Solana).
    if (incompleteLocal) {
      const attrs = await readAttributes(batch.asset);
      const onChain = attrs.find((a) => a.key === stageKey(stage));
      if (!onChain) {
        return NextResponse.json(
          { error: `stage ${stage} is incomplete locally but missing on-chain` },
          { status: 409 },
        );
      }
      const parsed = parseStageValue(onChain.value);
      if (parsed.photoHash !== photoHash) {
        return NextResponse.json(
          {
            error:
              "photo does not match the on-chain fingerprint for this stage — use the original photo",
          },
          { status: 409 },
        );
      }
      await putImage(photoFile, bytes, contentType);
      const row = {
        batch_id: batchId,
        stage,
        photo_file: photoFile,
        photo_hash: photoHash,
        note,
        actor,
        tx_sig: existing!.tx_sig,
        created_at: existing!.created_at,
        actor_org_id: org.id,
        org_snapshot: existing!.org_snapshot,
      };
      await completeStageLocal(row);
      return NextResponse.json(
        { stage: row, status: stageStatus({ ...row, id: existing!.id }) },
        { status: 200 },
      );
    }

    // Accept fast: store photo + pending row, write chain in the background.
    await putImage(photoFile, bytes, contentType);
    const row = {
      batch_id: batchId,
      stage,
      photo_file: photoFile,
      photo_hash: photoHash,
      note,
      actor,
      tx_sig: TX_PENDING,
      created_at: ts,
      actor_org_id: org.id,
      org_snapshot: orgSnapshotJson,
    };
    if (failedLocal) {
      await completeStageLocal(row);
    } else {
      await insertStage(row);
    }

    const asset = batch.asset;
    await runInBackground(async () => {
      try {
        const written = await recordStageOnChain({
          asset,
          stage,
          photoHash,
          ts,
          actor,
          snapshotHash,
        });
        const sig = written.signature || "confirmed-no-sig";
        await updateStageTxSig(batchId, stage, sig);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/already on-chain/i.test(msg)) {
          await updateStageTxSig(batchId, stage, "confirmed-existing");
          return;
        }
        await updateStageTxSig(batchId, stage, `failed:${msg.slice(0, 180)}`);
      }
    });

    return NextResponse.json({ stage: row, status: "pending" as const }, { status: 202 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `stage record failed: ${msg}` }, { status: 502 });
  }
}
