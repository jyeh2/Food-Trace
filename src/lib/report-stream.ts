import type { BatchReportData } from "@/lib/report-schema";

export type ReportStreamEvent =
  | { type: "status"; message: string }
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "tool-call"; toolName: string; args?: unknown }
  | { type: "tool-result"; toolName: string; result?: unknown }
  | { type: "done"; report: BatchReportData; model: string }
  | { type: "error"; message: string };

export type TraceItem = {
  id: string;
  kind: "status" | "reasoning" | "text" | "tool-call" | "tool-result" | "error";
  title: string;
  body?: string;
};

export function truncateTraceJson(value: unknown, max = 400): unknown {
  try {
    const s = JSON.stringify(value);
    if (s.length <= max) return value;
    return `${s.slice(0, max)}…`;
  } catch {
    return String(value).slice(0, max);
  }
}

function eventToItem(event: ReportStreamEvent, seq: number): TraceItem | null {
  switch (event.type) {
    case "status":
      return { id: `s-${seq}`, kind: "status", title: event.message };
    case "reasoning":
      return { id: `r-${seq}`, kind: "reasoning", title: "Thinking", body: event.text };
    case "text":
      return { id: `t-${seq}`, kind: "text", title: "Draft", body: event.text };
    case "tool-call":
      return {
        id: `tc-${seq}`,
        kind: "tool-call",
        title: `Tool · ${event.toolName}`,
        body: event.args != null ? JSON.stringify(event.args, null, 2) : undefined,
      };
    case "tool-result":
      return {
        id: `tr-${seq}`,
        kind: "tool-result",
        title: `Result · ${event.toolName}`,
        body: event.result != null ? JSON.stringify(event.result, null, 2) : undefined,
      };
    case "error":
      return { id: `e-${seq}`, kind: "error", title: "Error", body: event.message };
    case "done":
      return null;
    default:
      return null;
  }
}

/** Merge consecutive reasoning/text deltas into the last matching item. */
export function appendTraceEvent(
  items: TraceItem[],
  event: ReportStreamEvent,
  seq: number,
): TraceItem[] {
  if (event.type === "reasoning" || event.type === "text") {
    const kind = event.type === "reasoning" ? "reasoning" : "text";
    const last = items[items.length - 1];
    if (last && last.kind === kind) {
      return [...items.slice(0, -1), { ...last, body: (last.body ?? "") + event.text }];
    }
  }
  const next = eventToItem(event, seq);
  return next ? [...items, next] : items;
}
