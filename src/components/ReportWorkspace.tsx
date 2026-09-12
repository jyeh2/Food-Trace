"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BatchReport } from "@/components/BatchReport";
import { AgentTracePanel } from "@/components/AgentTracePanel";
import type { BatchReportData } from "@/lib/report-schema";
import {
  appendTraceEvent,
  type ReportStreamEvent,
  type TraceItem,
} from "@/lib/report-stream";

export function ReportWorkspace({
  batchId,
  initialReport,
  initialModel,
  autoStart,
}: {
  batchId: string;
  initialReport: BatchReportData | null;
  initialModel: string | null;
  autoStart: boolean;
}) {
  const [report, setReport] = useState<BatchReportData | null>(initialReport);
  const [model, setModel] = useState<string | null>(initialModel);
  const [cachedLabel, setCachedLabel] = useState(Boolean(initialReport) && !autoStart);
  const [streaming, setStreaming] = useState(false);
  const [items, setItems] = useState<TraceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const runStream = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    seqRef.current = 0;
    setItems([]);
    setError(null);
    setStreaming(true);
    setCachedLabel(false);

    try {
      const res = await fetch(`/api/reports/${batchId}/stream`, {
        method: "POST",
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => res.statusText);
        throw new Error(msg || `Stream failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let event: ReportStreamEvent;
          try {
            event = JSON.parse(trimmed) as ReportStreamEvent;
          } catch {
            continue;
          }
          seqRef.current += 1;
          setItems((prev) => appendTraceEvent(prev, event, seqRef.current));
          if (event.type === "done") {
            setReport(event.report);
            setModel(event.model);
          }
          if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ac.signal.aborted) setStreaming(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (!autoStart && initialReport) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void runStream();
    return () => {
      abortRef.current?.abort();
    };
  }, [autoStart, initialReport, runStream]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden text-xs text-cream-700">
        <Link href={`/verify/${batchId}`} className="underline">
          ← verify
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span>
            {streaming
              ? "Generating…"
              : report
                ? cachedLabel
                  ? "Cached report"
                  : "Freshly generated"
                : "No report yet"}
            {model ? ` · ${model}` : ""}
          </span>
          <button
            type="button"
            disabled={streaming}
            onClick={() => {
              startedRef.current = true;
              void runStream();
            }}
            className="rounded-full border border-cream-400 bg-cream-50 px-3 py-1 font-medium text-cream-900 disabled:opacity-50"
          >
            {streaming ? "Running…" : report ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden">
          {error}
        </p>
      ) : null}

      {streaming ? (
        <div className="print:hidden">
          <AgentTracePanel items={items} streaming />
        </div>
      ) : report ? (
        <BatchReport report={report} />
      ) : (
        <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50/50 px-8 py-16 text-center text-sm text-cream-700">
          No cached report. Click Generate to run the agent.
        </div>
      )}
    </div>
  );
}
