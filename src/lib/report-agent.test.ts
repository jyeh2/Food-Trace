import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("generateBatchReport", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when OPENROUTER_API_KEY is missing", async () => {
    const { generateBatchReport } = await import("./report-agent");
    await expect(generateBatchReport("ABCD")).rejects.toThrow(/OPENROUTER_API_KEY/);
  });
});
