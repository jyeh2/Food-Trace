import { NextResponse } from "next/server";
import { generateStationCode } from "@/lib/totp";
import { stageById } from "@/lib/stages";

export const runtime = "nodejs";

const SECRET = process.env.STATION_SECRET ?? "dev-station-secret-change-me";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ stage: string }> },
) {
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
