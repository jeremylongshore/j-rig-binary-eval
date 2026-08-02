# Real Provider Failure Boundary

**Status:** Accepted implementation contract  
**Date:** 2026-08-02  
**Scope:** `j-rig eval`, OpenAI-compatible providers, SQLite run evidence

## Decision

A real-provider outage is infrastructure evidence, not a skill result. The
evaluator must fail closed when a real execution or judge call fails. It must
not convert an account outage, quota exhaustion, authentication failure, or
transport failure into an exit-0 `warn`/`block` grade with
`ground_truth: true`.

This boundary is separate from a successfully completed model response whose
text is empty. A completed empty response remains observable boundary evidence
for tool- or script-dependent skills; a failed or timed-out provider call is
never a model response.

## Runtime contract

For a real provider failure during `j-rig eval`:

1. The current SQLite `runs` row transitions to `failed`.
2. `runs.error_message` stores a credential-free JSON diagnostic:

   ```json
   {
     "type": "provider_failure",
     "phase": "execution",
     "model": "deepseek-v4-flash",
     "provider": "deepseek",
     "category": "rate_limit",
     "retryable": false,
     "message": "Insufficient Balance"
   }
   ```

3. The CLI exits non-zero. With `--json`, stdout is a single
   `evaluation_failed` object containing the same safe `provider_failure`
   fields; it is not a gate-result bundle.
4. No normal ground-truth scorecard, Evidence Bundle, or report is emitted for
   the failed model.
5. `eval-batch` and `suite` retain the failure in their manifests/audits and may
   continue other independent cells according to their existing failure policy.

The diagnostic never stores or prints API keys. Provider metadata is limited to
the vendor-neutral category, provider, retryability, phase, model, and a
redacted message.

## Error classification

The existing `rate_limit` category covers request throttling and exhausted
quota/credits. HTTP 402 and provider messages such as `Insufficient Balance`
are classified as non-retryable until the account is funded. A 429 remains
retryable. This keeps the existing provider taxonomy stable while preserving
the operational distinction in the `retryable` field.

Typed provider failures are carried through functional outcomes and judgment
rows as `provider_failure` metadata. Unknown execution failures still fail a
real evaluation closed; they are classified as `unknown` rather than silently
treated as skill behavior.

## Operator migration

Operators consuming `j-rig eval --json` must check the process exit code before
ingesting stdout. A JSON object with `error: "evaluation_failed"` is diagnostic
evidence, not a gate decision. Fund, authenticate, or otherwise repair the
provider, then rerun the same pinned skill/spec. Do not backfill a synthetic
score for a failed real-provider run.

Stub evaluations are unchanged: they require explicit `J_RIG_ALLOW_STUB=1` and
remain `ground_truth: false`. Existing completed historical rows are not
rewritten; this contract applies to new executions.

## Verification evidence

On 2026-08-02 UTC, a pinned `audit-tests` DeepSeek invocation reached the API
but returned `Insufficient Balance` for both functional cases. Before this
contract it exited zero with `ground_truth: true`, `decision: warn`, and zero
provider calls recorded. The fixed CLI exited 1, produced the structured
failure diagnostic, and persisted the run as `failed` without leaking the
credential. Focused core, CLI provider, and DB tests cover the boundary.
