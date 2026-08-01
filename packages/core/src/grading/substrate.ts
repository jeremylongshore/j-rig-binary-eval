import { createHash } from "node:crypto";
import { z } from "zod";
import { EvalIdentifierSchema } from "../execution/substrate.js";

/** The first grader kind is intentionally deterministic and auditable. */
export const GraderCheckSchema = z.object({
  id: EvalIdentifierSchema,
  type: z.literal("output_contains"),
  expected: z.string().min(1),
  required: z.boolean().default(true),
});

export type GraderCheck = z.infer<typeof GraderCheckSchema>;

/** A named, versioned grader definition. The definition is the snapshot input. */
export const GraderDefinitionSchema = z.object({
  id: EvalIdentifierSchema,
  version: z.string().min(1),
  kind: z.literal("deterministic"),
  description: z.string().min(1).optional(),
  checks: z.array(GraderCheckSchema).min(1),
});

export type GraderDefinition = z.infer<typeof GraderDefinitionSchema>;

export const GradeVerdictSchema = z.enum(["pass", "fail"]);
export type GradeVerdict = z.infer<typeof GradeVerdictSchema>;

export interface GraderCheckResult {
  id: string;
  type: "output_contains";
  expected: string;
  passed: boolean;
  required: boolean;
  details: string;
}

export interface GradeEvaluation {
  raw_run_id: string;
  grader_id: string;
  grader_version: string;
  grader_kind: "deterministic";
  grader_snapshot_json: string;
  grader_snapshot_sha256: string;
  verdict: GradeVerdict;
  score: number;
  checks: GraderCheckResult[];
}

/** Serialize a parsed grader definition exactly as the Grade snapshot stores it. */
export function serializeGraderSnapshot(definition: GraderDefinition): string {
  return JSON.stringify(definition);
}

export function hashGraderSnapshot(definition: GraderDefinition): string {
  return `sha256:${createHash("sha256").update(serializeGraderSnapshot(definition)).digest("hex")}`;
}

/**
 * Evaluate one sealed raw stdout without mutating the Run.
 *
 * This is deliberately a deterministic checker. Model-judge Graders will use
 * the same GradeEvaluation persistence boundary but add their own snapshot and
 * disagreement metadata in a later bead.
 */
export function evaluateWithGrader(
  rawRunId: string,
  stdout: string,
  definition: GraderDefinition,
): GradeEvaluation {
  const checks = definition.checks.map((check): GraderCheckResult => {
    const passed = stdout.includes(check.expected);
    return {
      id: check.id,
      type: check.type,
      expected: check.expected,
      passed,
      required: check.required,
      details: passed
        ? `stdout contains ${JSON.stringify(check.expected)}`
        : `stdout is missing ${JSON.stringify(check.expected)}`,
    };
  });

  const requiredChecks = checks.filter((check) => check.required);
  const verdict: GradeVerdict = requiredChecks.every((check) => check.passed) ? "pass" : "fail";
  const score = checks.filter((check) => check.passed).length / checks.length;

  return {
    raw_run_id: rawRunId,
    grader_id: definition.id,
    grader_version: definition.version,
    grader_kind: definition.kind,
    grader_snapshot_json: serializeGraderSnapshot(definition),
    grader_snapshot_sha256: hashGraderSnapshot(definition),
    verdict,
    score,
    checks,
  };
}
