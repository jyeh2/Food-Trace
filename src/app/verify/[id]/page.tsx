import Link from "next/link";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, getBatch, listStages } from "@/lib/db";
import { ProductQr } from "@/components/ProductQr";
import { STAGES } from "@/lib/stages";
import { explorerUrl, parseStageValue, readAttributes, stageKey } from "@/lib/solana";

export const dynamic = "force-dynamic";

async function hashFile(file: string) {
  try {
    const b = await readFile(path.join(UPLOAD_DIR, file));
    return createHash("sha256").update(b).digest("hex");
  } catch {
    return null;
  }
}

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = getBatch(id.toUpperCase());
  if (!batch) notFound();

  const local = listStages(batch.id);
  let chain: Awaited<ReturnType<typeof readAttributes>> = [];
  let chainErr = "";
  try {
    chain = await readAttributes(batch.asset);
  } catch (e) {
    chainErr = e instanceof Error ? e.message : String(e);
  }

  const rows = await Promise.all(
    STAGES.map(async (s) => {
      const row = local.find((r) => r.stage === s.id);
      const onChain = chain.find((a) => a.key === stageKey(s.id));
      const parsed = onChain ? parseStageValue(onChain.value) : null;
      const fileHash = row ? await hashFile(row.photo_file) : null;
      const match = !!row && !!parsed && fileHash === parsed.photoHash;
      return { s, row, parsed, fileHash, match };
    }),
  );
  const done = rows.filter((r) => r.row).length;
  const allMatch = rows.filter((r) => r.row).every((r) => r.match);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{batch.name}</h1>
            <p className="text-sm text-stone-600">
              {batch.origin} · batch <span className="font-mono">#{batch.id}</span>
            </p>
          </div>
          <Badge ok={done > 0 && allMatch && !chainErr}>
            {chainErr ? "chain unreachable" : done === 0 ? "no stages yet" : allMatch ? "verified" : "TAMPERED"}
          </Badge>
        </div>
        <dl className="mt-3 grid gap-1 text-xs text-stone-600 sm:grid-cols-2">
          <dt>NFT asset</dt>
          <dd>
            <a className="break-all font-mono text-emerald-700 underline" href={explorerUrl("address", batch.asset)} target="_blank">
              {batch.asset}
            </a>
          </dd>
          <dt>Mint tx</dt>
          <dd>
            <a className="break-all font-mono text-emerald-700 underline" href={explorerUrl("tx", batch.mint_sig)} target="_blank">
              {batch.mint_sig.slice(0, 20)}…
            </a>
          </dd>
        </dl>
        {chainErr && <p className="mt-2 text-xs text-red-600">{chainErr}</p>}
        <ProductQr batchId={batch.id} />
      </div>

      <ol className="space-y-3">
        {rows.map(({ s, row, parsed, fileHash, match }) => (
          <li key={s.id} className={`rounded-lg border bg-white p-4 ${row ? "border-stone-200" : "border-dashed border-stone-200 opacity-60"}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{s.icon}</span>
              <span className="font-medium">{s.label}</span>
              <span className="ml-auto">
                {row ? <Badge ok={match}>{match ? "hash ✓" : "hash ✗"}</Badge> : <span className="text-xs text-stone-400">pending</span>}
              </span>
            </div>
            {row && (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/uploads/${row.photo_file}`} alt={s.label} className="h-40 w-full rounded object-cover sm:w-56" />
                <div className="flex-1 space-y-1 text-xs text-stone-600">
                  <p>
                    <b>{row.actor}</b> · {new Date(row.created_at).toLocaleString()}
                  </p>
                  {row.note && <p className="text-stone-800">“{row.note}”</p>}
                  <p>
                    on-chain sha256: <span className="break-all font-mono">{parsed?.photoHash ?? "—"}</span>
                  </p>
                  <p>
                    stored file sha256: <span className={`break-all font-mono ${match ? "" : "text-red-600"}`}>{fileHash ?? "missing"}</span>
                  </p>
                  <a className="text-emerald-700 underline" href={explorerUrl("tx", row.tx_sig)} target="_blank">
                    view tx
                  </a>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="text-center text-xs text-stone-400">
        <Link href="/" className="underline">← dashboard</Link>
      </p>
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
      {children}
    </span>
  );
}
