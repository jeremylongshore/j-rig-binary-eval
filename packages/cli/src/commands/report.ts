import type { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { getRun, getRecentRuns, getRunResults, getRunArtifacts, getUnifiedReport } from "@j-rig/db";
import {
  GradeSelectorSchema,
  renderUnifiedReportHtml,
  renderUnifiedReportMarkdown,
  type UnifiedReport,
} from "@j-rig/core";
import { openDb } from "../lib/db.js";
import { icon, formatDuration, formatScore, header } from "../lib/output.js";

export interface UnifiedReportOptions {
  db: string;
  graderId: string;
  graderVersion: string;
  graderSnapshotSha256: string;
  runIds?: readonly string[];
  json?: boolean;
  html?: boolean;
  output?: string;
}

export interface UnifiedReportResult {
  report: UnifiedReport;
  rendered: string;
}

/** Build a terminal/file projection over generic Runs and one Grade snapshot. */
export function runUnifiedReport(options: UnifiedReportOptions): UnifiedReportResult {
  const selector = GradeSelectorSchema.parse({
    grader_id: options.graderId,
    grader_version: options.graderVersion,
    grader_snapshot_sha256: options.graderSnapshotSha256,
  });
  const database = openDb(options.db);
  try {
    const report = getUnifiedReport(database, selector, new Date().toISOString(), options.runIds);
    const rendered = options.html
      ? renderUnifiedReportHtml(report)
      : options.json
        ? `${JSON.stringify(report, null, 2)}\n`
        : renderUnifiedReportMarkdown(report);
    if (options.output) writeFileSync(options.output, rendered, "utf8");
    return { report, rendered };
  } finally {
    database.close();
  }
}

/**
 * Register the `report` command on the given Commander program.
 *
 * Queries and displays evaluation results from the SQLite evidence store.
 * Without `--run-id`, lists recent runs in a compact table.
 * With `--run-id`, prints full criterion results and artifact metadata.
 */
export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Show evaluation results from the database")
    .option("--db <path>", "SQLite DB path", "j-rig.db")
    .option("--skill <name>", "Filter by skill name")
    .option("--run-id <id>", "Show detailed results for a specific run", parseInt)
    .option("--limit <n>", "Max runs to show", parseInt, 10)
    .option("--unified", "Report generic raw Runs and one selected immutable Grader snapshot")
    .option("--grader-id <id>", "Selected named Grader id (required with --unified)")
    .option("--grader-version <version>", "Selected Grader version (required with --unified)")
    .option(
      "--grader-snapshot-sha256 <digest>",
      "Selected Grader snapshot digest (required with --unified)",
    )
    .option("--output <path>", "Write the selected unified projection to a file")
    .option("--html", "Output a self-contained HTML report (with --unified)")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        db: string;
        skill?: string;
        runId?: number;
        limit: number;
        unified?: boolean;
        graderId?: string;
        graderVersion?: string;
        graderSnapshotSha256?: string;
        output?: string;
        html?: boolean;
        json?: boolean;
      }) => {
        try {
          if (opts.html && !opts.unified) {
            throw new Error("--html requires --unified");
          }
          if (opts.unified) {
            if (!opts.graderId || !opts.graderVersion || !opts.graderSnapshotSha256) {
              throw new Error(
                "--unified requires --grader-id, --grader-version, and --grader-snapshot-sha256",
              );
            }
            if (opts.html && opts.json) {
              throw new Error("--html and --json are mutually exclusive");
            }
            const result = runUnifiedReport({
              db: opts.db,
              graderId: opts.graderId,
              graderVersion: opts.graderVersion,
              graderSnapshotSha256: opts.graderSnapshotSha256,
              json: opts.json,
              html: opts.html,
              output: opts.output,
            });
            if (!opts.output) process.stdout.write(result.rendered);
            return;
          }

          const database = openDb(opts.db);

          if (opts.runId) {
            // Detail mode — single run with criterion results and artifacts
            const run = getRun(database, opts.runId);
            if (!run) {
              console.error(`Run #${opts.runId} not found`);
              process.exit(1);
            }
            const results = getRunResults(database, opts.runId);
            const arts = getRunArtifacts(database, opts.runId);

            if (opts.json) {
              console.log(JSON.stringify({ run, results, artifacts: arts }, null, 2));
            } else {
              const summary = run.summary;
              console.log(header(`Run #${run.id}`));
              console.log(
                `  Status: ${run.status} | Model: ${run.model ?? "n/a"} | Type: ${run.run_type}`,
              );
              if (run.duration_ms != null) {
                console.log(`  Duration: ${formatDuration(run.duration_ms)}`);
              }
              if (summary) {
                console.log(`  Score: ${formatScore(summary.passed, summary.total)}`);
              }

              console.log(`\n  ${header("Criterion Results:")}`);
              for (const r of results) {
                // severity from the DB row is a plain string; cast to the
                // narrowest union accepted by icon().
                const sev = r.severity as "pass" | "error" | "warning" | "info";
                const ic = r.passed ? icon("pass") : icon("error");
                const sevIcon = sev === "warning" ? ` ${icon("warning")}` : "";
                console.log(`    ${ic}${sevIcon} ${r.criterion_id}: ${r.message}`);
              }

              if (arts.length > 0) {
                console.log(`\n  ${header("Artifacts:")}`);
                for (const a of arts) {
                  console.log(`    ${a.filename} (${a.artifact_type})`);
                }
              }
            }
          } else {
            // List mode — compact table of recent runs
            const rows = getRecentRuns(database, {
              limit: opts.limit,
              skillName: opts.skill,
            });

            if (opts.json) {
              console.log(JSON.stringify(rows, null, 2));
            } else {
              console.log(header("Recent Runs:"));
              console.log(
                chalk.dim("  ID   Skill                       Model    Status      Date"),
              );
              for (const row of rows) {
                const r = row.runs;
                const sv = row.skill_versions;
                console.log(
                  `  ${String(r.id).padEnd(5)} ` +
                    `${sv.skill_name.padEnd(28)} ` +
                    `${(r.model ?? "n/a").padEnd(9)} ` +
                    `${r.status.padEnd(12)} ` +
                    `${r.created_at?.slice(0, 10) ?? ""}`,
                );
              }
              if (rows.length === 0) {
                console.log(chalk.dim("  No runs found."));
              }
            }
          }
        } catch (err) {
          console.error(`Error: ${err instanceof Error ? err.message : err}`);
          process.exit(1);
        }
      },
    );
}
