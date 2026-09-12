"use client";

import { useEffect, useRef } from "react";
import type { TraceItem } from "@/lib/report-stream";

export type { TraceItem };

const kindClass: Record<TraceItem["kind"], string> = {
  status: "text-cream-600",
  reasoning: "border-l-2 border-amber-600/50 pl-2 text-amber-950/80",
  text: "border-l-2 border-forest-700/40 pl-2 text-cream-900",
  "tool-call": "rounded bg-cream-100 px-2 py-1 text-cream-800",
  "tool-result": "rounded bg-cream-50 px-2 py-1 text-cream-700",
  error: "rounded bg-red-50 px-2 py-1 text-red-800",
};

export function AgentTracePanel({
  items,
  streaming,
  idleHint,
}: {
  items: TraceItem[];
  streaming: boolean;
  idleHint?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, streaming]);

  return (
    <aside className="flex w-full min-h-[420px] max-h-[min(70vh,720px)] flex-col rounded-2xl border border-cream-300 bg-cream-50/80 print:hidden">
      <div className="flex items-center justify-between border-b border-cream-300 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-cream-700">
          Agent trace
        </h2>
        {streaming ? (
          <span className="text-[11px] text-forest-800 animate-pulse">Streaming…</span>
        ) : (
          <span className="text-[11px] text-cream-500">Read-only</span>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-xs leading-relaxed">
        {items.length === 0 ? (
          <p className="text-cream-600">{idleHint ?? "Agent trace appears when you generate or regenerate."}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className={kindClass[item.kind]}>
              <div className="font-medium">{item.title}</div>
              {item.body ? (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-[11px] opacity-90">
                  {item.body}
                </pre>
              ) : null}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </aside>
  );
}
