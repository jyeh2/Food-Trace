import Link from "next/link";
import { getSessionOrg } from "@/lib/auth";
import { HomeDashboard } from "./HomeDashboard";

export default async function Page() {
  const org = await getSessionOrg();
  if (!org) {
    return (
      <div className="mx-auto max-w-sm space-y-3 rounded-lg border border-stone-200 bg-white p-6 text-center dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-lg font-semibold">Log in to continue</h1>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Batch records and minting are only visible to logged-in org accounts.
        </p>
        <div className="flex justify-center gap-4 text-sm">
          <Link href="/login" className="text-emerald-700 underline dark:text-emerald-400">Log in</Link>
          <Link href="/register" className="text-emerald-700 underline dark:text-emerald-400">Register org</Link>
        </div>
      </div>
    );
  }
  return <HomeDashboard />;
}
