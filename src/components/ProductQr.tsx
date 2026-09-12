"use client";
import { useState } from "react";
import { Qr } from "./Qr";

/** A single disclosure for sharing or printing the customer product-page QR. */
export function ProductQr({ batchId }: { batchId: string }) {
  const [url, setUrl] = useState("");
  const open = url !== "";
  return (
    <div className="mt-3 border-t border-cream-300 pt-3 dark:border-olive-700">
      <button
        type="button"
        onClick={() => setUrl(open ? "" : `${window.location.origin}/verify/${batchId}`)}
        aria-expanded={open}
        className="min-h-11 text-sm font-medium text-olive-700 underline underline-offset-4 dark:text-olive-300"
      >
        {open ? "Hide product QR" : "Show product QR"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <Qr value={url} size={160} />
          <div className="min-w-0 text-xs text-cream-700 dark:text-cream-300">
            <p>Scan to open this customer product page.</p>
            <p className="mt-2 break-all font-mono">{url}</p>
            <button type="button" onClick={() => window.print()} className="mt-2 min-h-11 underline underline-offset-4">
              Print
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
