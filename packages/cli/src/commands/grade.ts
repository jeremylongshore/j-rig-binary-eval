import type { Command } from "commander";
import { readFileSync } from "node:fs";
import {
  evaluateWithGrader,
  GraderDefinitionSchema,
  parseAndValidateYaml,
  type GraderDefinition,
} from "@j-rig/core";
import { createGrade, getGradesForRun, getRawRun } from "@j-rig/db";
import { openDb } from "../lib/db.js";

export interface GradeCommandOptions {
  runId: string;
  graderPath: string;
  db: string;
  regrade: boolean;
}

export interface GradeCommandResult {
  grade: NonNullable<ReturnType<typeof createGrade>>["grade"];
  created: boolean;
}

export function loadGraderDefinition(path: string): GraderDefinition {
  const content = readFileSync(path, "utf8");
  const parsed = parseAndValidateYaml(content, GraderDefinitionSchema);
  if (!parsed.success) {
    const details = parsed.errors
      .map((error) => (error.path ? `${error.path}: ${error.message}` : error.message))
      .join("; ");
    throw new Error(`Invalid grader definition at ${path}: ${details}`);
  }
  return parsed.data;
}

/** Grade one completed raw Run and persist an immutable Grade snapshot. */
export function runGrade(options: GradeCommandOptions): GradeCommandResult {
  const definition = loadGraderDefinition(options.graderPath);
  const database = openDb(options.db);

  try {
    const rawRun = getRawRun(database, options.runId);
    if (!rawRun) throw new Error(`Raw Run ${options.runId} not found`);
    if (rawRun.status !== "completed") {
      throw new Error(
        `Raw Run ${options.runId} is ${rawRun.status}; only completed Runs can be graded`,
      );
    }

    const evaluation = evaluateWithGrader(rawRun.id, rawRun.stdout ?? "", definition);
    const existingGrades = getGradesForRun(database, rawRun.id);
    const exactGrade = existingGrades.find(
      (grade) =>
        grade.grader_id === evaluation.grader_id &&
        grade.grader_version === evaluation.grader_version &&
        grade.grader_snapshot_sha256 === evaluation.grader_snapshot_sha256,
    );
    const existingNamedGrade = existingGrades.find(
      (grade) => grade.grader_id === evaluation.grader_id,
    );
    if (existingNamedGrade && !exactGrade && !options.regrade) {
      throw new Error(
        `Raw Run ${rawRun.id} already has ${definition.id}; pass --regrade to add ${definition.version} or a changed snapshot`,
      );
    }

    return createGrade(database, evaluation);
  } finally {
    database.close();
  }
}

function printGrade(result: GradeCommandResult, json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify({ grade: result.grade, created: result.created }, null, 2));
    return;
  }

  console.log(`Grade ${result.grade.id}${result.created ? "" : " (existing)"}`);
  console.log(
    `  Run: ${result.grade.raw_run_id} | Grader: ${result.grade.grader_id}@${result.grade.grader_version}`,
  );
  console.log(`  Verdict: ${result.grade.verdict} | Score: ${result.grade.score}`);
}

/** Register `j-rig grade`, the first deterministic named-grader surface. */
export function registerGradeCommand(program: Command): void {
  program
    .command("grade")
    .description("Grade a completed raw Run with a named immutable grader snapshot")
    .requiredOption("--run-id <id>", "Raw Run id")
    .requiredOption("--grader <path>", "YAML grader definition")
    .option("--db <path>", "SQLite DB path", "j-rig.db")
    .option("--regrade", "Allow a new grader version to coexist with an earlier Grade")
    .option("--json", "Output the Grade as JSON")
    .action(
      (opts: { runId: string; grader: string; db: string; regrade?: boolean; json?: boolean }) => {
        try {
          const result = runGrade({
            runId: opts.runId,
            graderPath: opts.grader,
            db: opts.db,
            regrade: opts.regrade === true,
          });
          printGrade(result, opts.json);
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
          process.exitCode = 1;
        }
      },
    );
}
