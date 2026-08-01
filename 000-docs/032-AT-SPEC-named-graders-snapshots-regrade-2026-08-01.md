# Named Graders, Immutable Grade Snapshots, and Regrade Contract

**Plan:** `IEP-EVAL-EVOLUTION-001`
**Bead:** `bd_000-projects-htjt.7`
**Status:** ACTIVE — implementation slice
**Date:** 2026-08-01

## Purpose

The generic raw Run substrate records what the harness observed. This slice
adds the first explicit quality boundary: a named, versioned Grader evaluates a
completed Run and creates an immutable Grade. A Grade stores the exact Grader
definition used, its digest, every check result, and the final verdict.

The existing skill-specific `runs` and Evidence Bundle path remain compatible.
The new `grades` table is downstream of `raw_runs`; it never rewrites a Run and
it cannot grade runner failures or timeouts.

## Grader definition

The first Grader kind is deterministic and checks whether stdout contains named
expected strings:

```yaml
# grader.yaml
id: answer-contract
version: "1"
kind: deterministic
description: The harness returned the required answer
checks:
  - id: answer-is-four
    type: output_contains
    expected: "4"
    required: true
```

`required` defaults to `true`. The Grade verdict is `pass` only when every
required check passes. The score is the fraction of all checks that pass; this
score is diagnostic and does not replace the binary verdict.

## Snapshot and identity

Before persistence, J-Rig serializes the parsed definition and records a
`sha256:<64 lowercase hex>` digest. A Grade identity is the tuple:

`raw_run_id + grader_id + grader_version + grader_snapshot_sha256`

The identity is content-addressed and unique. Repeating the same command is
idempotent and returns the existing Grade. Changing the definition or version
creates a new Grade row, preserving the earlier judgment for audit and
comparison.

## Regrade policy

Only a `completed` raw Run can receive a Grade. A runner error or timeout is
retained as a raw observation but is not silently converted into a quality
failure.

When a Run already has a Grade for the same named Grader, a different version
requires explicit operator intent:

```bash
j-rig grade \
  --run-id raw_<sha256> \
  --grader ./grader-v2.yaml \
  --db ./j-rig.db \
  --regrade \
  --json
```

The prior Grade remains immutable. Later model-judge Graders, disagreement
metadata, balanced sampling, and report aggregation build on this persistence
boundary in dependent evolution slices.

## CLI

```bash
j-rig grade \
  --run-id raw_<sha256> \
  --grader ./grader.yaml \
  --db ./j-rig.db \
  --json
```

The JSON result includes the stored Grade row and whether it was newly created.
The command loads and validates the YAML definition before evaluating stdout;
it never executes the task again.
