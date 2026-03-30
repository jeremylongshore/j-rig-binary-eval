export { detectRegressions } from "./regression.js";
export { compareBaseline, isObsoleteCandidate } from "./baseline.js";
export { computeScoreCard, decideRollout, buildLaunchReport } from "./scoring.js";
export type {
  RolloutDecision,
  Regression,
  BaselineComparison,
  ScoreCard,
  LaunchReport,
} from "./types.js";
