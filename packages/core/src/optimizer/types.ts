import type { JudgmentResult } from "../judgment/types.js";

/**
 * A cluster of related failures.
 */
export interface FailureCluster {
  pattern: string;
  criterion_ids: string[];
  count: number;
  severity: "critical" | "high" | "medium";
}

/**
 * A single atomic change proposal.
 * The optimizer proposes exactly ONE change per experiment.
 */
export interface ChangeProposal {
  id: string;
  target_criterion: string;
  change_type: "description" | "instruction" | "example" | "trigger" | "constraint";
  description: string;
  rationale: string;
  expected_impact: string;
}

/**
 * Experiment status.
 */
export type ExperimentStatus = "proposed" | "running" | "accepted" | "rejected" | "reverted";

/**
 * An experiment — one proposed change with before/after evidence.
 */
export interface Experiment {
  id: string;
  proposal: ChangeProposal;
  status: ExperimentStatus;
  before_results?: JudgmentResult[];
  after_results?: JudgmentResult[];
  improvement: boolean | null;
  created_at: string;
  resolved_at?: string;
}

/**
 * Provider interface for generating change proposals.
 * Abstracts the LLM call for optimization suggestions.
 */
export interface OptimizerProvider {
  proposeChange(
    failingCriteria: Array<{ id: string; description: string; reasoning: string }>,
    skillBody: string,
  ): Promise<ChangeProposal>;
}
