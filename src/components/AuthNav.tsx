"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABELS, type OrgRole } from "@/lib/orgs";

type SessionOrg = { id: string; name: string; role: OrgRole } | null;

export function AuthNav({ consumer = false }: { consumer?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [org, setOrg] = useState<SessionOrg | undefined>(undefined);

  // AuthNav lives in the root layout, which persists across client-side
  // navigations — refetch whenever the route changes (e.g. after login
  // or register redirects to "/") so it doesn't stick on a stale session.
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => alive && setOrg(j.org))
      .catch(() => alive && setOrg(null));
    return () => {
      alive = false;
    };
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOrg(null);
    router.push("/");
    router.refresh();
  }

  if (org === undefined) return null;

  if (!org) {
    if (consumer) {
      return (
        <Link href="/login" className="ml-auto py-2 text-cream-700 underline-offset-4 hover:text-olive-900 hover:underline">
          Are you a supply chain partner? Log in
        </Link>
      );
    }
    return (
      <span className="flex min-w-0 shrink items-center gap-2 text-sm sm:gap-3">
        <Link href="/login" className="shrink-0 text-cream-700 hover:text-olive-900 hover:underline">Log in</Link>
        <Link href="/register" className="shrink-0 truncate text-cream-700 hover:text-olive-900 hover:underline">Register org</Link>
      </span>
    );
  }

  if (consumer) {
    return (
      <>
        <span className="text-cream-400">|</span>
        <Link href="/scan" className="text-cream-700 hover:text-olive-900 hover:underline">Scan</Link>
        <Link href="/station/1" className="text-cream-700 hover:text-olive-900 hover:underline">Stations</Link>
        <span className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-cream-700 dark:text-cream-300">
            {org.name} · <span className="font-mono text-xs">{ROLE_LABELS[org.role]}</span>
          </span>
          <button onClick={logout} className="text-cream-700 hover:text-olive-900 hover:underline">Log out</button>
          <span className="rounded-full bg-forest-100 px-3 py-0.5 text-xs text-forest-800">
            Solana devnet
          </span>
        </span>
      </>
    );
  }

  return (
    <span className="flex min-w-0 shrink items-center gap-2 text-sm sm:gap-3">
      <span className="min-w-0 truncate text-cream-700 dark:text-cream-300">
        {org.name} · <span className="font-mono text-xs">{ROLE_LABELS[org.role]}</span>
      </span>
      <button onClick={logout} className="shrink-0 text-cream-700 hover:text-olive-900 hover:underline">Log out</button>
    </span>
  );
}
