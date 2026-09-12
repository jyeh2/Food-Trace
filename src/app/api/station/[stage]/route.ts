import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { generateStationCode } from "@/lib/totp";
import { stageById } from "@/lib/stages";

export const runtime = "nodejs";

const SECRET = process.env.STATION_SECRET ?? "dev-station-secret-change-me";
// Separate key that the station display device must present. Without it,
// anyone could fetch the current code remotely and bypass proof-of-presence.
const DISPLAY_KEY = process.env.STATION_DISPLAY_KEY ?? "";

function keyOk(given: string | null) {
  if (!DISPLAY_KEY || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(DISPLAY_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ stage: string }> },
) {
  if (!keyOk(req.headers.get("x-station-key"))) {
    return NextResponse.json({ error: "unauthorized station display" }, { status: 401 });
  }
  const { stage: raw } = await ctx.params;
  const stage = Number(raw);
  const meta = stageById(stage);
  if (!meta) return NextResponse.json({ error: "unknown stage" }, { status: 404 });
  const { code, expiresAt } = generateStationCode(SECRET, stage);
  // Payload the phone scanner decodes. Compact JSON, no URL needed.
  const payload = JSON.stringify({ t: "station", s: stage, c: code });
  return NextResponse.json(
    { stage, label: meta.label, code, expiresAt, payload },
    { headers: { "Cache-Control": "no-store" } },
  );
}
