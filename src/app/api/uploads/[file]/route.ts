import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ file: string }> },
) {
  const { file } = await ctx.params;
  if (!/^[A-Z0-9]+-s\d-[a-f0-9]+\.(jpg|png)$/i.test(file)) {
    return new Response("bad name", { status: 400 });
  }
  try {
    const bytes = await readFile(path.join(UPLOAD_DIR, file));
    return new Response(bytes, {
      headers: {
        "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
