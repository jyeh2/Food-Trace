import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getOrgById, type OrgRow } from "@/lib/db";

export const SESSION_COOKIE = "foodtrace_session";
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60; // 7 days

const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-session-secret-change-me";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sign(payload: string) {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

/** Session token = "<orgId>.<expiresAtMs>.<hmac>" — stateless, no server-side session store. */
export function createSessionToken(orgId: string, nowMs = Date.now()): string {
  const expires = nowMs + SESSION_MAX_AGE_S * 1000;
  const payload = `${orgId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null, nowMs = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [orgId, expiresStr, sig] = parts;
  const payload = `${orgId}.${expiresStr}`;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (nowMs > Number(expiresStr)) return null;
  return orgId;
}

/** Reads the session cookie for the current request and loads the org (Route Handlers + Server Components). */
export async function getSessionOrg(): Promise<OrgRow | null> {
  const jar = await cookies();
  const orgId = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!orgId) return null;
  const org = await getOrgById(orgId);
  if (!org || !org.active) return null;
  return org;
}
