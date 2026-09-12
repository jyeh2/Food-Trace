"use client";
import { useState } from "react";
import { Qr } from "./Qr";

/** Collapsible product-label QR. Encodes this page's URL so any phone lands here. */
export function ProductQr({ batchId }: { batchId: string }) {
  const [url, setUrl] = useState("");
  const open = url !== "";
  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <button
        onClick={() => setUrl(open ? "" : `${window.location.origin}/verify/${batchId}`)}
        className="text-xs text-emerald-700 underline"
      >
        {open ? "Hide" : "Show"} product QR
      </button>
      {open && (
        <div className="mt-2 flex flex-col items-center gap-2 sm:flex-row">
          <Qr value={url} size={160} />
          <div className="text-xs text-stone-600">
            <p>Print on the product label.</p>
            <p className="break-all font-mono">{url}</p>
            <button onClick={() => window.print()} className="mt-1 underline">
              Print
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
