export { matchIntent, INTENTS } from './intents.js'
export {
  normalized,
  stripAccents,
  resolveDateRange,
  resolveSaoPaulo,
  resolveTopN,
  resolveWorst,
  resolveElectronics,
  detectUnsupported,
  SUPPORTED_DOMAIN_MESSAGE,
  type Resolution,
  type StateSide,
  type DateRange,
} from './normalizer.js'
export { executePlan, type PlanExecution, type NodeOutcome, type ExecutorDeps } from './executor.js'
export { keyedMerge, MergeError, type MergeResult, type MergedRow } from './merge.js'
export {
  fromTrends,
  fromRanking,
  fromScoreDistribution,
  fromComposition,
  buildQ7Ranking,
  buildQ8TimeSeries,
  buildQ9Correlation,
  buildQ10Correlation,
} from './normalized-data.js'
export { buildInsight, monthLabel, formatBRL, formatPct, type InsightResult } from './insight.js'
export { fallbackChartOptions, type FallbackChartResult } from './charts/fallback.js'
export { selectChartOptions, type ChartSelection } from './charts/selector.js'
export {
  lineTimeSeries,
  dualAxisLineTimeSeries,
  horizontalBarRanking,
  verticalBarComparison,
  doughnutComposition,
  scatterCorrelation,
  stackedScoreDistribution,
} from './charts/factories.js'
