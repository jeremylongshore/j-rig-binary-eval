import { describe, expect, it } from "vitest";
import { evaluateWithGrader, GraderDefinitionSchema, hashGraderSnapshot } from "./substrate.js";

const grader = GraderDefinitionSchema.parse({
  id: "answer-checker",
  version: "1.0.0",
  kind: "deterministic",
  checks: [
    { id: "has-answer", type: "output_contains", expected: "4" },
    { id: "has-explanation", type: "output_contains", expected: "because" },
  ],
});

describe("named deterministic graders", () => {
  it("evaluates raw output without changing the source Run", () => {
    const grade = evaluateWithGrader("raw_123", "The answer is 4 because arithmetic.", grader);

    expect(grade.raw_run_id).toBe("raw_123");
    expect(grade.grader_id).toBe("answer-checker");
    expect(grade.grader_version).toBe("1.0.0");
    expect(grade.verdict).toBe("pass");
    expect(grade.score).toBe(1);
    expect(grade.checks).toHaveLength(2);
    expect(grade.grader_snapshot_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("keeps partial quality distinct from a required verdict", () => {
    const grade = evaluateWithGrader("raw_123", "The answer is 4.", grader);

    expect(grade.verdict).toBe("fail");
    expect(grade.score).toBe(0.5);
    expect(grade.checks[1]?.details).toContain("missing");
  });

  it("changes the snapshot hash when a grader version or rule changes", () => {
    const changed = GraderDefinitionSchema.parse({
      ...grader,
      version: "2.0.0",
      checks: [...grader.checks, { id: "has-period", type: "output_contains", expected: "." }],
    });

    expect(hashGraderSnapshot(changed)).not.toBe(hashGraderSnapshot(grader));
  });
});
