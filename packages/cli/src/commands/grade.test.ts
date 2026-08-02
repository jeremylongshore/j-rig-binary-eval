import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify } from "yaml";
import { runGenericEval } from "./run.js";
import { runGrade } from "./grade.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "j-rig-grade-"));
  tempDirs.push(dir);
  const taskPath = join(dir, "task.yaml");
  const configPath = join(dir, "config.yaml");
  const graderV1Path = join(dir, "grader-v1.yaml");
  const graderV2Path = join(dir, "grader-v2.yaml");
  const modelGraderPath = join(dir, "grader-model.yaml");
  const db = join(dir, "runs.db");

  writeFileSync(
    taskPath,
    stringify({ id: "answer-task", version: "1", input: { question: "2+2" } }),
  );
  writeFileSync(
    configPath,
    stringify({
      id: "fixture-config",
      version: "1",
      model: "fixture-model",
      harness: {
        command: process.execPath,
        args: ["-e", 'process.stdout.write("The answer is 4 because arithmetic.");'],
      },
    }),
  );
  writeFileSync(
    graderV1Path,
    stringify({
      id: "answer-checker",
      version: "1.0.0",
      kind: "deterministic",
      checks: [{ id: "has-answer", type: "output_contains", expected: "4" }],
    }),
  );
  writeFileSync(
    graderV2Path,
    stringify({
      id: "answer-checker",
      version: "2.0.0",
      kind: "deterministic",
      checks: [
        { id: "has-answer", type: "output_contains", expected: "4" },
        { id: "has-explanation", type: "output_contains", expected: "because" },
      ],
    }),
  );
  writeFileSync(
    modelGraderPath,
    stringify({
      id: "quality-judge",
      version: "1.0.0",
      kind: "model_judge",
      model: "fixture-judge",
      criterion_description: "The output is correct",
      judge_prompt: "Answer yes only when the output is correct.",
      samples: 3,
    }),
  );
  return { taskPath, configPath, graderV1Path, graderV2Path, modelGraderPath, db };
}

describe("j-rig grade", () => {
  it("grades a raw Run and keeps a regrade as a second immutable snapshot", async () => {
    const paths = fixture();
    const raw = await runGenericEval({ ...paths, sampleIndex: 0 });

    const first = await runGrade({
      runId: raw.run.id,
      graderPath: paths.graderV1Path,
      db: paths.db,
      regrade: false,
    });
    const repeat = await runGrade({
      runId: raw.run.id,
      graderPath: paths.graderV1Path,
      db: paths.db,
      regrade: false,
    });
    const second = await runGrade({
      runId: raw.run.id,
      graderPath: paths.graderV2Path,
      db: paths.db,
      regrade: true,
    });
    const repeatV1 = await runGrade({
      runId: raw.run.id,
      graderPath: paths.graderV1Path,
      db: paths.db,
      regrade: false,
    });

    expect(first.created).toBe(true);
    expect(repeat.created).toBe(false);
    expect(first.grade.id).not.toBe(second.grade.id);
    expect(second.grade.grader_version).toBe("2.0.0");
    expect(repeatV1.created).toBe(false);
    expect(repeatV1.grade.id).toBe(first.grade.id);
  });

  it("requires --regrade before changing a grader version", async () => {
    const paths = fixture();
    const raw = await runGenericEval({ ...paths, sampleIndex: 0 });
    await runGrade({
      runId: raw.run.id,
      graderPath: paths.graderV1Path,
      db: paths.db,
      regrade: false,
    });

    await expect(
      runGrade({
        runId: raw.run.id,
        graderPath: paths.graderV2Path,
        db: paths.db,
        regrade: false,
      }),
    ).rejects.toThrow("pass --regrade");
  });

  it("runs a sampled model-judge grader and persists disagreement evidence", async () => {
    const paths = fixture();
    const raw = await runGenericEval({ ...paths, sampleIndex: 0 });
    const votes: Array<"yes" | "no" | "unsure"> = ["yes", "no", "yes"];

    const result = await runGrade({
      runId: raw.run.id,
      graderPath: paths.modelGraderPath,
      db: paths.db,
      regrade: false,
      judge: {
        async judge() {
          return {
            verdict: votes.shift() ?? "unsure",
            confidence: 0.5,
            reasoning: "fixture vote",
          };
        },
      },
    });

    expect(result.created).toBe(true);
    expect(result.grade.grader_kind).toBe("model_judge");
    expect(JSON.parse(result.grade.metadata_json ?? "{}")).toMatchObject({
      judge: {
        raw_verdict: "yes",
        samples: 3,
        agreement: 2 / 3,
        sample_verdicts: ["yes", "no", "yes"],
        disagreement: true,
      },
    });
  });
});
