import { getBatch } from "@/lib/db";
import { streamBatchReport } from "@/lib/report-agent";
import { computeReportFingerprint, saveGeneratedReport } from "@/lib/report-service";
import { parseBatchReport } from "@/lib/report-schema";
import {
  truncateTraceJson,
  type ReportStreamEvent,
} from "@/lib/report-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ batch_id: string }> },
) {
  const { batch_id } = await ctx.params;
  const id = batch_id.toUpperCase();
  const batch = await getBatch(id);
  if (!batch) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ReportStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        send({ type: "status", message: "Starting agent…" });
        const fp = await computeReportFingerprint(id);
        if ("error" in fp) {
          send({ type: "error", message: "batch not found" });
          controller.close();
          return;
        }

        const { result, model } = await streamBatchReport(id, req.signal);
        send({ type: "status", message: `Model ${model}` });

        for await (const part of result.fullStream) {
          switch (part.type) {
            case "reasoning-delta":
              if (part.text) send({ type: "reasoning", text: part.text });
              break;
            case "text-delta":
              if (part.text) send({ type: "text", text: part.text });
              break;
            case "tool-call":
              send({
                type: "tool-call",
                toolName: String(part.toolName),
                args: truncateTraceJson(part.input),
              });
              break;
            case "tool-result":
              send({
                type: "tool-result",
                toolName: String(part.toolName),
                result: truncateTraceJson(part.output),
              });
              break;
            case "error":
              send({
                type: "error",
                message:
                  part.error instanceof Error
                    ? part.error.message
                    : String(part.error),
              });
              break;
            default:
              break;
          }
        }

        send({ type: "status", message: "Assembling structured report…" });
        const output = await result.output;
        if (!output) {
          send({ type: "error", message: "Model finished without structured report output" });
          controller.close();
          return;
        }

        const report = parseBatchReport(JSON.stringify(output));
        await saveGeneratedReport({
          batchId: id,
          report,
          model,
          fingerprint: fp.fingerprint,
        });
        send({ type: "done", report, model });
      } catch (e) {
        if (req.signal.aborted) {
          send({ type: "error", message: "Aborted" });
        } else {
          send({
            type: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
