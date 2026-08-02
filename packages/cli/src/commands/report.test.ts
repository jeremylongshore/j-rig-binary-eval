import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateWithGrader, GraderDefinitionSchema } from "@j-rig/core";
import { createDatabase, createGrade, createRawRun, sealRawRun, startRawRun } from "@j-rig/db";
import { runUnifiedReport } from "./report.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("unified report command", () => {
  it("renders selected Grade lineage as JSON and Markdown", () => {
    const dir = mkdtempSync(join(tmpdir(), "j-rig-report-"));
    tempDirs.push(dir);
    const dbPath = join(dir, "runs.db");
    const database = createDatabase(dbPath);
    const run = createRawRun(database, {
      task_id: "task-a",
      task_version: "1",
      config_id: "config-a",
      config_version: "1",
      model: "model-a",
      sample_index: 0,
      task: { id: "task-a" },
      config: { id: "config-a" },
      request: {},
    });
    startRawRun(database, run.id);
    sealRawRun(database, run.id, {
      status: "completed",
      stdout: "4",
      stderr: "",
      exit_code: 0,
      signal: null,
      started_at: "2026-08-01T00:00:00.000Z",
      completed_at: "2026-08-01T00:00:00.001Z",
      duration_ms: 1,
      artifacts: [],
    });
    const grader = GraderDefinitionSchema.parse({
      id: "answer-checker",
      version: "1.0.0",
      kind: "deterministic",
      checks: [{ id: "has-answer", type: "output_contains", expected: "4" }],
    });
    const evaluation = evaluateWithGrader(run.id, "4", grader);
    createGrade(database, evaluation);
    database.close();

    const json = runUnifiedReport({
      db: dbPath,
      graderId: grader.id,
      graderVersion: grader.version,
      graderSnapshotSha256: evaluation.grader_snapshot_sha256,
      json: true,
    });
    expect(JSON.parse(json.rendered).schema).toBe("j-rig/unified-report/v1");
    expect(json.report.summary.graded_runs).toBe(1);

    const markdown = runUnifiedReport({
      db: dbPath,
      graderId: grader.id,
      graderVersion: grader.version,
      graderSnapshotSha256: evaluation.grader_snapshot_sha256,
    });
    expect(markdown.rendered).toContain("# J-Rig Unified Evaluation Report");
    expect(markdown.rendered).toContain("answer-checker@1.0.0");

    const html = runUnifiedReport({
      db: dbPath,
      graderId: grader.id,
      graderVersion: grader.version,
      graderSnapshotSha256: evaluation.grader_snapshot_sha256,
      html: true,
    });
    expect(html.rendered).toContain("<!doctype html>");
    expect(html.rendered).toContain('aria-labelledby="cells-heading"');
    expect(html.rendered).toContain("answer-checker@1.0.0");
  });
});
