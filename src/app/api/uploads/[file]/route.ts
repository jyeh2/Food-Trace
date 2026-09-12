import { getImage } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ file: string }> },
) {
  const { file } = await ctx.params;
  if (!/^[A-Z0-9]+-s\d-[a-f0-9]+\.(jpg|png)$/i.test(file)) {
    return new Response("bad name", { status: 400 });
  }
  const bytes = await getImage(file);
  if (!bytes) {
    return new Response("not found", { status: 404 });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
