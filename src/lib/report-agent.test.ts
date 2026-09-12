import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendTraceEvent } from "./report-stream";

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

  it("exports temperature 0.7", async () => {
    const { REPORT_TEMPERATURE } = await import("./report-agent");
    expect(REPORT_TEMPERATURE).toBe(0.7);
  });
});

describe("appendTraceEvent", () => {
  it("merges consecutive reasoning deltas", () => {
    let items = appendTraceEvent([], { type: "reasoning", text: "Hello" }, 1);
    items = appendTraceEvent(items, { type: "reasoning", text: " world" }, 2);
    expect(items).toHaveLength(1);
    expect(items[0]?.body).toBe("Hello world");
  });
});
