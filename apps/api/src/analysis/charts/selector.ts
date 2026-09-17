import type { ChartConfig, NormalizedData } from '@olist/contracts'
import {
  lineTimeSeries,
  dualAxisLineTimeSeries,
  horizontalBarRanking,
  verticalBarComparison,
  doughnutComposition,
  scatterCorrelation,
  stackedScoreDistribution,
} from './factories.js'

// Normal-mode chart selection (prepared for Phase 4). Fallback does NOT use
// this selector — it always uses the bar-only fallback strategy.
// Genuinely ambiguous shapes return exactly two validated options.

export interface ChartSelection {
  options: ChartConfig[]
  chartType: string
  chartReason: string
}

export function selectChartOptions(data: NormalizedData): ChartSelection {
  switch (data.kind) {
    case 'time_series': {
      if (data.series.length === 1) {
        return {
          options: [lineTimeSeries(data)],
          chartType: 'line',
          chartReason: 'Line chart selected because the result is a single metric across ordered time periods.',
        }
      }
      return {
        options: [dualAxisLineTimeSeries(data)],
        chartType: 'line',
        chartReason: 'Line chart with separate named y-axes selected because two metrics with different units share the same time axis.',
      }
    }
    case 'ranking': {
      const h = horizontalBarRanking(data, 'ranked-bar-h')
      const v = verticalBarComparison(data, 'ranked-bar-v')
      return {
        options: [h, v],
        chartType: 'bar',
        chartReason:
          'Two defensible bar orientations fit a ranked list: horizontal bars (long labels readable) and vertical bars (compact). Both options are returned.',
      }
    }
    case 'composition': {
      return {
        options: [doughnutComposition(data)],
        chartType: 'doughnut',
        chartReason: 'Donut chart selected because the result is a part-to-whole composition over all payment methods.',
      }
    }
    case 'correlation': {
      return {
        options: [scatterCorrelation(data)],
        chartType: 'scatter',
        chartReason: 'Scatter chart selected because two continuous variables are compared per entity.',
      }
    }
    case 'distribution': {
      return {
        options: [stackedScoreDistribution(data)],
        chartType: 'bar',
        chartReason: 'Stacked horizontal bar selected for a 1-5 score distribution with one dataset per score.',
      }
    }
  }
}
