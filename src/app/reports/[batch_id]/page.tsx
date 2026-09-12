import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchReport } from "@/components/BatchReport";
import { getBatch } from "@/lib/db";
import { loadOrGenerateReport } from "@/lib/report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ batch_id: string }>;
  searchParams: Promise<{ refresh?: string }>;
}) {
  const { batch_id } = await params;
  const sp = await searchParams;
  const id = batch_id.toUpperCase();
  const batch = await getBatch(id);
  if (!batch) notFound();

  const result = await loadOrGenerateReport(id, { refresh: sp.refresh === "1" });

  if (!result.ok) {
    return (
      <div className="space-y-4 rounded-2xl border border-cream-300 bg-cream-50 p-6">
        <h1 className="text-lg font-semibold">Could not generate report</h1>
        <p className="text-sm text-cream-700">{result.error}</p>
        <p className="text-sm">
          <Link className="underline" href={`/reports/${id}?refresh=1`}>
            Retry
          </Link>
          {" · "}
          <Link className="underline" href={`/verify/${id}`}>
            Verify page
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden text-xs text-cream-700">
        <Link href={`/verify/${id}`} className="underline">
          ← verify
        </Link>
        <span>
          {result.cached ? "Cached report" : "Freshly generated"} · {result.model}{" "}
          <Link className="underline" href={`/reports/${id}?refresh=1`}>
            Regenerate
          </Link>
        </span>
      </div>
      <BatchReport report={result.report} />
    </div>
  );
}
