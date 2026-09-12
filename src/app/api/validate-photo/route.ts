import { NextResponse } from "next/server";
import { getSessionOrg } from "@/lib/auth";

export const runtime = "nodejs";

// Routed through OpenRouter (OpenAI-compatible chat completions) rather than
// calling Google directly, since the org's Gemini access now goes through an
// OpenRouter key. max_tokens is capped low — without it, OpenRouter requests
// the model's full max output (65536) up front and free-tier credits can't
// cover that, even though the actual response is only a couple sentences.
const MODEL = "google/gemini-3.6-flash";
const MAX_TOKENS = 300;

/** Uses a vision model (via OpenRouter) to check a stage photo actually shows
 * the claimed produce, since a photo hash alone only proves the file wasn't
 * edited after upload — it says nothing about what's actually in the frame. */
export async function POST(req: Request) {
  const org = await getSessionOrg();
  if (!org) {
    return NextResponse.json({ error: "log in as an org to validate a photo" }, { status: 401 });
  }

  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPEN_ROUTER_API_KEY is not set on the server" }, { status: 500 });
  }

  const form = await req.formData();
  const photo = form.get("photo");
  const produceName = String(form.get("produceName") ?? "").trim();
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "photo required" }, { status: 400 });
  }
  if (!produceName) {
    return NextResponse.json({ error: "produceName required" }, { status: 400 });
  }

  const bytes = Buffer.from(await photo.arrayBuffer());
  const mimeType = photo.type || "image/jpeg";
  const prompt = [
    `You are checking a farm-to-table supply chain photo. A worker recording a`,
    `shipment stage claims this photo shows: "${produceName}".`,
    ``,
    `The produce may be packaged — in boxes, crates, bags, or containers —`,
    `rather than loose and fully visible. Use any visible cues (the produce`,
    `itself, printed labels, packaging shape/color, or partial glimpses through`,
    `openings) to judge plausibility. Don't require the produce to be fully`,
    `exposed to count as a match.`,
    ``,
    `Does the photo plausibly show "${produceName}" or packaging consistent`,
    `with it? Respond with ONLY strict JSON, no other text, matching exactly`,
    `this shape: {"matches": boolean, "reasoning": "one short sentence"}.`,
  ].join("\n");

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` } },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`OpenRouter API error ${r.status}: ${errText.slice(0, 300)}`);
    }
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Model returned no content");
    const parsed = JSON.parse(text) as { matches: boolean; reasoning: string };
    return NextResponse.json(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `validation failed: ${msg}` }, { status: 502 });
  }
}
