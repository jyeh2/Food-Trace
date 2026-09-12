"use client";
import { use } from "react";
import dynamic from "next/dynamic";

// Client-only: the display reads window.location and sessionStorage at init.
const StationDisplay = dynamic(
  () => import("./StationDisplay").then((m) => m.StationDisplay),
  { ssr: false, loading: () => <p className="text-sm text-cream-600">Loading station…</p> },
);

/** Station display: rotating QR. Put this on a screen at each physical stage. */
export default function StationPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = use(params);
  return <StationDisplay stage={stage} />;
}
