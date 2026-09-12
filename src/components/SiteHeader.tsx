"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthNav } from "./AuthNav";

export function SiteHeader() {
  const consumer = usePathname().startsWith("/verify/");
  return (
        <header className="sticky top-0 z-10 border-b border-cream-300 bg-cream-50/90 backdrop-blur-md">
          <nav className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="flex items-center gap-1.5 font-semibold tracking-tight text-olive-900">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-forest-800">
                <path d="M4 20c0-8 4-14 12-16-1 7-3 12-12 16Z" fill="currentColor" />
                <path d="M4 20c1-6 5-9 10-10" stroke="#f9f4ec" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              FoodTrace
            </Link>
            {consumer ? <AuthNav consumer /> : <>
            <span className="text-cream-400">|</span>
            <Link href="/scan" className="text-cream-700 hover:text-olive-900 hover:underline">Scan</Link>
            <Link href="/station/1" className="text-cream-700 hover:text-olive-900 hover:underline">Stations</Link>
            <span className="ml-auto flex items-center gap-3">
              <AuthNav />
              <span className="rounded-full bg-forest-100 px-3 py-0.5 text-xs text-forest-800">
                Solana devnet
              </span>
            </span>
            </>}
          </nav>
        </header>
  );
}
