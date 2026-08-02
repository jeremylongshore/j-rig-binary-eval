# J-Rig skill-promotion Evidence Bundle contract

**Status:** IMPLEMENTED — `bd_000-projects-htjt.13.3`
**Plan:** `IEP-EVAL-EVOLUTION-001`
**Date:** 2026-08-02

## Purpose

The legacy `j-rig eval` command predates the generic Run/Grade substrate, but
its `j-rig:local:<skill>.<model>` Evidence Bundle rows are consumed by the
same rollout gate. A rollout consumer must therefore be able to prove which
run, skill snapshot, skill-profile spec, and effective grader produced a row;
it must also distinguish a measured regression pass from an omitted comparison.

The metadata contract is `j-rig/skill-promotion/v1`. It is additive to the
kernel-owned `gate-result/v1` predicate and does not redefine that schema.

## Identity fields

Each emitted skill row contains:

- `eval_run_id` and `run_ids`: the OTel UUIDv7 EvalRun identity for the model
  evaluation;
- `storage_run_id` and `storage_run_ids`: the local SQLite run key, retained as
  an implementation reference;
- `skill`: the skill name/version, a content-addressed `skill_version_id`, and
  the raw `SKILL.md` snapshot digest;
- `eval_spec`: the stable J-Rig skill-profile reference, profile version, and
  parsed-profile digest; the `identity_kind` explicitly says this is a
  `SkillEvalSpec` profile, not the canonical kernel `EvalSpec`;
- `selected_grader`: `grader_id`, `grader_version`, and a digest of the exact
  criteria plus judge/stability settings used for this row.

The canonical `SkillEvalSpec → EvalSpec` adapter remains the authority for a
future kernel `EvalSpec` identity. This contract does not mislabel the current
legacy profile as that canonical entity.

## Promotion semantics

`thresholds` records the observed binary score and the required clean threshold
(`required_pass_rate: 1`). `regression` is required for promotion and has one
of three explicit results:

- `not-run`: no baseline was supplied; the row cannot be a promotion pass;
- `no-regressions`: a content-addressed baseline was compared and none were
  found;
- `regressions-found`: the comparison ran and found one or more regressions.

`promotion_eligible` is true only when the J-Rig decision is `ship`, all
thresholds pass, and regression result is `no-regressions`. The Evidence Bundle
`gate_decision` is consequently:

| Condition | `gate_decision` |
| --- | --- |
| Promotion eligible | `pass` |
| Incomplete, warning, obsolete, or non-sacred regression evidence | `advisory` |
| J-Rig block or sacred regression | `fail` |

This means `j-rig eval --emit-bundle` without `--regression-baseline` remains a
valid, inspectable evaluation artifact but cannot silently become a rollout
approval. The baseline-value layer is also recorded explicitly as `not-run`,
`adds-value`, `obsolete-review`, or `no-comparison`.

## Verification requirements

Producers validate the metadata contract before composing the kernel statement.
Consumers must fail closed when the metadata is absent, malformed, inconsistent
with the row's hashes, or incompatible with their promotion policy. The grader
snapshot digest is generated from recursively key-sorted JSON, so equivalent
object construction order cannot create a false identity change.

The next rollout-gate consumer slice will require this contract for the real
skill path while retaining the generic `j-rig/unified-report/v1` path for
Run/Grade reports.
