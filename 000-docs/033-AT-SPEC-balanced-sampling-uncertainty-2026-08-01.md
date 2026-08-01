# Balanced Execution Sampling and Uncertainty Contract

**Plan:** `IEP-EVAL-EVOLUTION-001`
**Bead:** `bd_000-projects-htjt.3`
**Status:** ACTIVE — implementation slice
**Date:** 2026-08-01

## Purpose

The raw Run ledger records individual attempts. This slice adds the planning
and measurement rules needed to make a run set statistically legible without
silently combining unlike populations.

Execution sampling and judge sampling are separate:

- execution sampling repeats the complete Task × Config × Model attempt;
- judge sampling repeats a Grader over an already captured Run and never spends
  another runner/model execution.

The existing skill-specific evaluator remains compatible. These APIs operate on
the generic `raw_runs` and selected immutable `grades` records.

## Sampling cell and target N

A sampling cell is the complete identity:

```yaml
task_id: answer-task
task_version: "1"
config_id: local-harness
config_version: "1"
model: fixture-model
```

`target_n` means successful completed Runs required for every cell. The planner
top-ups cells in round-robin passes. It assigns a fresh sample index after the
highest existing index, preserving raw Run idempotence and avoiding a retry
collision.

Existing statuses are counted as follows:

| Status | Counts toward target N | Planner behavior |
|---|---:|---|
| `completed` | Yes | Satisfies one execution slot |
| `pending`, `running` | Reserved | Prevents a duplicate in-flight slot |
| `runner_error`, `timed_out` | No | Retained for diagnosis; replaced by a fresh sample |

The resulting plan reports attempted, completed, active, harness-failure, and
planned counts per cell. A plan is resumable: after a worker seals another Run,
the next plan only schedules the remaining top-up jobs.

## CLI plan surface

The first CLI surface is deliberately plan-only. It makes the scheduler
inspectable while the later suite/batch bead owns execution orchestration:

```yaml
# sampling-manifest.yaml
cells:
  - task_id: answer-task
    task_version: "1"
    config_id: local-harness
    config_version: "1"
    model: fixture-model
```

```bash
j-rig sample-plan \
  --manifest ./sampling-manifest.yaml \
  --target-n 3 \
  --db ./j-rig.db \
  --json
```

Each returned job can be executed by `j-rig run` with the corresponding task,
config, and sample index. The plan does not execute a harness or call a judge.

## Grade measurement

Reports select one complete Grader identity:

`grader_id + grader_version + grader_snapshot_sha256`

Measurements group only by the full sampling-cell key plus that selected
Grader. The summary exposes:

- attempted, completed, active, and harness-failure counts;
- graded and ungraded-completed counts;
- binary pass/fail counts and pass rate;
- Bernoulli standard error and a 95% Wilson interval;
- mean checker score and standard error where numeric scores exist.

Runner failures are not model failures. Ungraded completed Runs are not failed
Grades. A changed Grader snapshot cannot be mixed with the selected snapshot;
the caller must choose one identity explicitly.

## C3 protection

The grouping key retains task, task version, config, config version, model, and
Grader snapshot. The measurement API never emits one rolled-up score across
heterogeneous predicate URIs, meters, tenants, or other dimensions that are not
part of this generic cell. A future report may add an explicit cross-cell policy
but cannot infer one from the renderer.

## Non-goals of this slice

This contract does not yet define suite/batch manifests, concurrent execution,
external-judge vote sampling, or the unified report/serve/static publication
surface. Those remain dependent evolution slices.
