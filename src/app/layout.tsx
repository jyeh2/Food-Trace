import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthNav } from "@/components/AuthNav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FoodTrace",
  description: "Farm-to-shelf provenance on Solana",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <nav className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              🥬 FoodTrace
            </Link>
            <span className="text-stone-300 dark:text-stone-700">|</span>
            <Link href="/scan" className="hover:underline">Scan</Link>
            <Link href="/station/1" className="hover:underline">Stations</Link>
            <span className="ml-auto flex items-center gap-3">
              <AuthNav />
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Solana devnet
              </span>
            </span>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
