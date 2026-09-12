import { NextResponse } from "next/server";
import { getOrgByEmail, toPublicOrg } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, createSessionToken, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { contact_email?: string; password?: string };
  const email = String(body.contact_email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const org = getOrgByEmail(email);
  if (!org || !org.active || !verifyPassword(password, org.password_hash)) {
    return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
  }
  const res = NextResponse.json({ org: toPublicOrg(org) });
  res.cookies.set(SESSION_COOKIE, createSessionToken(org.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
