import { describe, it, expect } from "vitest";
import { detectDrift, needsReevaluation } from "./detector.js";
import type { JudgmentResult } from "../judgment/types.js";

function result(id: string, verdict: "yes" | "no" | "unsure"): JudgmentResult {
  return { criterion_id: id, verdict, confidence: 1, reasoning: "", method: "judge" };
}

describe("drift detection", () => {
  it("detects drift when criteria change", () => {
    const prev = [result("c1", "yes"), result("c2", "yes")];
    const curr = [result("c1", "yes"), result("c2", "no")];

    const report = detectDrift("test-skill", "model_update", prev, curr);
    expect(report.drift_detected).toBe(true);
    expect(report.drifted_criteria).toEqual(["c2"]);
    expect(report.trigger).toBe("model_update");
  });

  it("reports no drift when results match", () => {
    const prev = [result("c1", "yes"), result("c2", "no")];
    const curr = [result("c1", "yes"), result("c2", "no")];

    const report = detectDrift("test-skill", "scheduled", prev, curr);
    expect(report.drift_detected).toBe(false);
    expect(report.drifted_criteria).toHaveLength(0);
  });

  it("detects improvements as drift too", () => {
    const prev = [result("c1", "no")];
    const curr = [result("c1", "yes")];

    const report = detectDrift("test-skill", "manual", prev, curr);
    expect(report.drift_detected).toBe(true);
  });

  it("includes run IDs when provided", () => {
    const report = detectDrift("skill", "scheduled", [], [], 5, 10);
    expect(report.previous_run_id).toBe(5);
    expect(report.current_run_id).toBe(10);
  });
});

describe("reevaluation scheduling", () => {
  it("flags old runs for reevaluation", () => {
    const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    expect(needsReevaluation(old, 30)).toBe(true);
  });

  it("does not flag recent runs", () => {
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(needsReevaluation(recent, 30)).toBe(false);
  });

  it("uses custom threshold", () => {
    const twoWeeks = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(needsReevaluation(twoWeeks, 7)).toBe(true);
    expect(needsReevaluation(twoWeeks, 30)).toBe(false);
  });
});
