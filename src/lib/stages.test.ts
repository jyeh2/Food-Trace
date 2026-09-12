import { describe, expect, it } from "vitest";
import { STAGES, nextAllowedStage, stageById } from "./stages";

describe("stage ordering", () => {
  it("first stage after none recorded is 1", () => {
    expect(nextAllowedStage(0)).toBe(1);
  });
  it("advances strictly by one", () => {
    expect(nextAllowedStage(1)).toBe(2);
    expect(nextAllowedStage(3)).toBe(4);
  });
  it("returns null once all stages done", () => {
    expect(nextAllowedStage(STAGES.length)).toBeNull();
  });
  it("looks up stage metadata", () => {
    expect(stageById(2)?.key).toBe("processing");
    expect(stageById(99)).toBeUndefined();
  });
});
