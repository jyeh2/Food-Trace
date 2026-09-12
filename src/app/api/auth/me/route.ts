import { NextResponse } from "next/server";
import { toPublicOrg } from "@/lib/db";
import { getSessionOrg } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const org = await getSessionOrg();
  return NextResponse.json({ org: org ? toPublicOrg(org) : null });
}
