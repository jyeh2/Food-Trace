import { describe, expect, it } from "vitest";
import { generateStationCode, verifyStationCode, TOTP_STEP_MS } from "./totp";

const S = "secret";

describe("station rotating code", () => {
  it("verifies code from current window", () => {
    const t = 1_000_000_000;
    const { code } = generateStationCode(S, 2, t);
    expect(verifyStationCode(S, 2, code, t)).toBe(true);
  });

  it("accepts previous window, rejects two windows back", () => {
    const t = 1_000_000_000;
    const { code } = generateStationCode(S, 1, t);
    expect(verifyStationCode(S, 1, code, t + TOTP_STEP_MS)).toBe(true);
    expect(verifyStationCode(S, 1, code, t + 2 * TOTP_STEP_MS)).toBe(false);
  });

  it("rejects code for a different stage", () => {
    const t = 1_000_000_000;
    const { code } = generateStationCode(S, 1, t);
    expect(verifyStationCode(S, 3, code, t)).toBe(false);
  });

  it("rejects malformed code", () => {
    expect(verifyStationCode(S, 1, "nope", Date.now())).toBe(false);
  });

  it("reports rotation time", () => {
    const t = 1_000_000_000;
    const { expiresAt } = generateStationCode(S, 1, t);
    expect(expiresAt).toBeGreaterThan(t);
    expect(expiresAt - t).toBeLessThanOrEqual(TOTP_STEP_MS);
  });
});
