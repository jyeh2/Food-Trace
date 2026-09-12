import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("generateBatchReport", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.IFM_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when IFM_API_KEY is missing", async () => {
    const { generateBatchReport } = await import("./report-agent");
    await expect(generateBatchReport("ABCD")).rejects.toThrow(/IFM_API_KEY/);
  });
});
