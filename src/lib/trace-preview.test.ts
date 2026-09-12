import { describe, expect, it } from "vitest";
import { createTracePreview, TRACE_SCENARIOS } from "./trace-preview";

describe("isolated trace previews", () => {
  it("covers an absent product and each sequential completion state", () => {
    expect(createTracePreview("empty").batch).toBeNull();
    for (let count = 0; count <= 4; count++) {
      const data = createTracePreview(count ? `through-${count}` : "registered");
      expect(data.rows.filter((r) => r.row)).toHaveLength(count);
      expect(data.rows.slice(0, count).every((r) => r.match)).toBe(true);
      expect(data.rows.slice(count).every((r) => !r.row)).toBe(true);
    }
  });
  it("fails only the selected stage and leaves later stages pending", () => {
    for (let stage = 1; stage <= 4; stage++) {
      const { rows } = createTracePreview(`error-${stage}`);
      expect(rows.slice(0, stage - 1).every((r) => r.match)).toBe(true);
      expect(rows[stage - 1].row).toBeDefined();
      expect(rows[stage - 1].match).toBe(false);
      expect(rows.slice(stage).every((r) => !r.row)).toBe(true);
    }
  });
  it("distinguishes missing photos, missing chain records and RPC failures", () => {
    expect(createTracePreview("missing-photo").rows[1].fileHash).toBeNull();
    expect(createTracePreview("missing-photo").rows[1].photoUrl).toBeUndefined();
    expect(createTracePreview("missing-chain").rows[1].parsed).toBeNull();
    const offline = createTracePreview("chain-offline");
    expect(offline.chainErr).not.toBe("");
    expect(offline.rows.every((r) => r.row && !r.parsed && !r.match)).toBe(true);
  });
  it("uses self-contained images, no live links, and fresh fixture objects", () => {
    for (const { id } of TRACE_SCENARIOS) {
      const data = createTracePreview(id);
      expect(data.assetUrl).toBeUndefined();
      expect(data.mintUrl).toBeUndefined();
      for (const row of data.rows) {
        expect(row.txUrl).toBeUndefined();
        if (row.photoUrl) expect(row.photoUrl).toMatch(/^data:image\/svg\+xml,/);
      }
    }
    const first = createTracePreview("through-4");
    first.rows[0].row!.note = "changed";
    expect(createTracePreview("through-4").rows[0].row!.note).not.toBe("changed");
  });
});
