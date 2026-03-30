/**
 * Reason for triggering a drift reevaluation.
 */
export type DriftTrigger = "model_update" | "skill_change" | "scheduled" | "manual";

/**
 * Drift detection result for a skill.
 */
export interface DriftReport {
  skill_name: string;
  trigger: DriftTrigger;
  previous_run_id: number | null;
  current_run_id: number | null;
  drifted_criteria: string[];
  drift_detected: boolean;
  timestamp: string;
}

/**
 * An eval pack — reusable evaluation template for a skill category.
 */
export interface EvalPack {
  name: string;
  description: string;
  category: string;
  criteria_templates: Array<{
    id: string;
    description: string;
    method: "deterministic" | "judge";
    blocker: boolean;
  }>;
  test_case_templates: Array<{
    id: string;
    description: string;
    tier: "core" | "edge" | "regression" | "adversarial";
    prompt_template: string;
  }>;
}
