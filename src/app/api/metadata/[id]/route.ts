import { NextResponse } from "next/server";
import { getBatch, listStages } from "@/lib/db";
import { stageById } from "@/lib/stages";

export const runtime = "nodejs";

/** Off-chain NFT metadata JSON (Metaplex standard shape). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const batch = await getBatch(id.toUpperCase());
  if (!batch) return NextResponse.json({ error: "not found" }, { status: 404 });
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const stages = await listStages(batch.id);
  return NextResponse.json({
    name: `FoodTrace ${batch.name} #${batch.id}`,
    symbol: "FOOD",
    description: `Provenance record for ${batch.name} from ${batch.origin}.`,
    image: stages[0] ? `${base}/api/uploads/${stages[0].photo_file}` : undefined,
    external_url: `${base}/verify/${batch.id}`,
    attributes: [
      { trait_type: "origin", value: batch.origin },
      ...stages.map((s) => ({
        trait_type: stageById(s.stage)?.label ?? `stage ${s.stage}`,
        value: s.photo_hash,
      })),
    ],
  });
}
