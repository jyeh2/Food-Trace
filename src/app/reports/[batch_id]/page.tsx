import { notFound } from "next/navigation";
import { ReportWorkspace } from "@/components/ReportWorkspace";
import { getBatch } from "@/lib/db";
import { loadCachedReport } from "@/lib/report-service";

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

  const cached = await loadCachedReport(id);
  if (!cached.ok) notFound();

  const autoStart = sp.refresh === "1" || cached.report === null;

  return (
    <ReportWorkspace
      batchId={id}
      initialReport={cached.report}
      initialModel={cached.model}
      autoStart={autoStart}
    />
  );
}
