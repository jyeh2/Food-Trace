import { createHmac, timingSafeEqual } from "node:crypto";

export const TOTP_STEP_MS = 90_000; // 1.5 min
const CODE_LEN = 8;

function counterFor(nowMs: number) {
  return Math.floor(nowMs / TOTP_STEP_MS);
}

function codeForCounter(secret: string, stage: number, counter: number) {
  return createHmac("sha256", secret)
    .update(`${stage}:${counter}`)
    .digest("hex")
    .slice(0, CODE_LEN);
}

/** Current rotating code for a station, plus ms until it rotates. */
export function generateStationCode(
  secret: string,
  stage: number,
  nowMs = Date.now(),
) {
  const counter = counterFor(nowMs);
  const expiresAt = (counter + 1) * TOTP_STEP_MS;
  return { code: codeForCounter(secret, stage, counter), expiresAt };
}

/** Accept current window and one on either side (clock skew / scan delay). */
export function verifyStationCode(
  secret: string,
  stage: number,
  code: string,
  nowMs = Date.now(),
  window = 1,
) {
  if (typeof code !== "string" || code.length !== CODE_LEN) return false;
  const counter = counterFor(nowMs);
  const given = Buffer.from(code);
  for (let d = -window; d <= window; d++) {
    const expected = Buffer.from(codeForCounter(secret, stage, counter + d));
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return true;
    }
  }
  return false;
}
