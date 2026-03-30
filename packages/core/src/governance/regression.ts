import type { JudgmentResult } from "../judgment/types.js";
import type { Criterion } from "../schemas/criterion.js";
import type { Regression } from "./types.js";

/**
 * Compare two runs and detect regressions.
 *
 * A regression occurs when a criterion that previously passed now fails.
 * Sacred regressions (regression_critical criteria) block release.
 */
export function detectRegressions(
  previousResults: JudgmentResult[],
  currentResults: JudgmentResult[],
  criteria: Criterion[],
): Regression[] {
  const regressions: Regression[] = [];
  const criteriaMap = new Map(criteria.map((c) => [c.id, c]));

  const prevMap = new Map(previousResults.map((r) => [r.criterion_id, r]));

  for (const current of currentResults) {
    const prev = prevMap.get(current.criterion_id);
    if (!prev) continue;

    // Regression: was passing, now failing or unsure
    if (prev.verdict === "yes" && current.verdict !== "yes") {
      const criterion = criteriaMap.get(current.criterion_id);
      regressions.push({
        criterion_id: current.criterion_id,
        previous_verdict: "yes",
        current_verdict: current.verdict,
        is_sacred: criterion?.regression_critical ?? false,
      });
    }
  }

  return regressions;
}
