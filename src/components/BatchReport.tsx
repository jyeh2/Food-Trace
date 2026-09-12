import Link from "next/link";
import type { BatchReportData } from "@/lib/report-schema";
import { explorerUrl } from "@/lib/explorer";

export function BatchReport({ report }: { report: BatchReportData }) {
  const { product, journey, trust, auditor, generatedAt } = report;
  return (
    <article className="report-sheet mx-auto w-full max-w-[816px] bg-white text-neutral-900 shadow-sm print:shadow-none">
      <header className="border-b border-neutral-200 px-8 py-10 sm:px-12">
        <p className="text-xs tracking-[0.2em] uppercase text-neutral-500">FoodTrace product report</p>
        <h1 className="mt-3 font-[family-name:var(--font-fraunces)] text-3xl sm:text-4xl">{product.title}</h1>
        <p className="mt-2 text-lg text-neutral-600">{product.tagline}</p>
        <p className="mt-4 text-sm text-neutral-500">
          Batch <span className="font-mono">#{auditor.batchId}</span>
          {" · "}
          Generated {new Date(generatedAt).toLocaleString()}
        </p>
      </header>

      <section className="space-y-4 border-b border-neutral-200 px-8 py-8 sm:px-12">
        <h2 className="font-[family-name:var(--font-fraunces)] text-xl">Product story</h2>
        {product.originStory.split(/\n\n+/).map((p, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-neutral-800">{p}</p>
        ))}
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-neutral-700">
          {product.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>

      <section className="border-b border-neutral-200 px-8 py-8 sm:px-12">
        <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-xl">Journey</h2>
        <ol className="space-y-4">
          {journey.map((j) => (
            <li key={j.stageId} className={j.status === "pending" ? "opacity-50" : ""}>
              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Stage {j.stageId} · {j.stageLabel} · {j.status}
              </div>
              <div className="font-medium">{j.headline}</div>
              <p className="text-sm text-neutral-700">{j.summary}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-b border-neutral-200 px-8 py-8 sm:px-12">
        <h2 className="mb-2 font-[family-name:var(--font-fraunces)] text-xl">Trust</h2>
        <p className="text-sm text-neutral-800">{trust.verificationSummary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {trust.badges.map((b) => (
            <span key={b} className="border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700">
              {b}
            </span>
          ))}
        </div>
      </section>

      <section className="px-8 py-8 sm:px-12">
        <h2 className="mb-4 font-[family-name:var(--font-fraunces)] text-xl">Auditor appendix</h2>
        <dl className="grid gap-2 text-xs sm:grid-cols-[8rem_1fr]">
          <dt className="text-neutral-500">NFT asset</dt>
          <dd>
            <a className="break-all font-mono underline" href={explorerUrl("address", auditor.nftAsset)} target="_blank" rel="noreferrer">
              {auditor.nftAsset}
            </a>
          </dd>
          <dt className="text-neutral-500">Mint tx</dt>
          <dd>
            <a className="break-all font-mono underline" href={explorerUrl("tx", auditor.mintTx)} target="_blank" rel="noreferrer">
              {auditor.mintTx}
            </a>
          </dd>
        </dl>

        {auditor.farmerOrg && (
          <div className="mt-4 text-sm">
            <h3 className="font-medium">Farmer org</h3>
            <p>
              {auditor.farmerOrg.name} ({auditor.farmerOrg.role}) · {auditor.farmerOrg.verificationStatus}
            </p>
            {auditor.farmerOrg.certifications.length > 0 && (
              <p className="text-xs text-neutral-600">
                Certs: {auditor.farmerOrg.certifications.join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-2 pr-2 font-medium">Stage</th>
                <th className="py-2 pr-2 font-medium">Actor</th>
                <th className="py-2 pr-2 font-medium">Photo hash</th>
                <th className="py-2 pr-2 font-medium">Tx</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {auditor.stages.map((s) => (
                <tr key={s.stageId} className="border-b border-neutral-100 align-top">
                  <td className="py-2 pr-2">{s.stageId}. {s.label}</td>
                  <td className="py-2 pr-2">
                    {s.actor}
                    {s.actorOrg ? ` (${s.actorOrg.name})` : ""}
                  </td>
                  <td className="py-2 pr-2 font-mono break-all">{s.photoHash}</td>
                  <td className="py-2 pr-2">
                    <a className="font-mono underline" href={explorerUrl("tx", s.txSig)} target="_blank" rel="noreferrer">
                      {s.txSig.slice(0, 12)}…
                    </a>
                  </td>
                  <td className="py-2">{s.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {auditor.integrityNotes.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-neutral-600">
            {auditor.integrityNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-neutral-200 px-8 py-6 text-center text-xs text-neutral-500 sm:px-12 print:hidden">
        <Link href={`/verify/${auditor.batchId}`} className="underline">
          Open verify page
        </Link>
        {" · "}
        FoodTrace
      </footer>
    </article>
  );
}
