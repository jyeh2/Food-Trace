import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { ProduceDecor } from "@/components/ProduceDecor";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Open-license stand-in for the Financier Display / GT Sectra style of
// editorial display serif — used for headings only, body stays on Geist.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "FoodTrace",
  description: "Farm-to-shelf provenance on Solana",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col overflow-x-hidden bg-cream-200 text-olive-900 dark:bg-olive-900 dark:text-cream-100"
        suppressHydrationWarning
      >
        <ProduceDecor />
        <SiteHeader />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
