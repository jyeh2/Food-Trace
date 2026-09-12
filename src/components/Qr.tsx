"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Qr({ value, size = 256 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then((d) => alive && setSrc(d))
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} className="bg-stone-100 dark:bg-stone-800" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="QR code" className="rounded" />;
}
