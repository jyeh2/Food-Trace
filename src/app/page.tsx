import Link from "next/link";
import { getSessionOrg } from "@/lib/auth";
import { HomeDashboard } from "./HomeDashboard";

export default async function Page() {
  const org = await getSessionOrg();
  if (!org) {
    return (
      <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-cream-300 bg-cream-50 p-6 text-center dark:border-olive-700 dark:bg-olive-800">
        <h1 className="text-lg font-semibold text-olive-900 dark:text-cream-100">Log in to continue</h1>
        <p className="text-sm text-cream-700 dark:text-cream-300">
          Batch records and minting are only visible to logged-in org accounts.
        </p>
        <div className="flex justify-center gap-4 text-sm">
          <Link href="/login" className="text-forest-800 underline dark:text-olive-300">Log in</Link>
          <Link href="/register" className="text-forest-800 underline dark:text-olive-300">Register org</Link>
        </div>
      </div>
    );
  }
  return <HomeDashboard />;
}
