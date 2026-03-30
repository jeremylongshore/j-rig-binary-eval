/**
 * Rollout recommendation.
 */
export type RolloutDecision = "ship" | "warn" | "block" | "obsolete_review";

/**
 * A regression detected between two runs.
 */
export interface Regression {
  criterion_id: string;
  previous_verdict: "yes" | "no";
  current_verdict: "yes" | "no" | "unsure";
  is_sacred: boolean;
}

/**
 * Baseline comparison result for a single criterion.
 */
export interface BaselineComparison {
  criterion_id: string;
  with_skill: "yes" | "no" | "unsure";
  without_skill: "yes" | "no" | "unsure";
  skill_adds_value: boolean;
}

/**
 * Aggregated score for a run.
 */
export interface ScoreCard {
  total_criteria: number;
  passed: number;
  failed: number;
  unsure: number;
  blocker_failures: number;
  sacred_regressions: number;
  pass_rate: number;
}

/**
 * Launch report — the canonical rollout recommendation artifact.
 */
export interface LaunchReport {
  skill_name: string;
  timestamp: string;
  decision: RolloutDecision;
  score: ScoreCard;
  regressions: Regression[];
  baseline: BaselineComparison[];
  blockers: string[];
  warnings: string[];
  reasoning: string;
}
