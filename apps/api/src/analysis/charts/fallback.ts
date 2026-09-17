import type { ChartConfig, NormalizedData } from '@olist/contracts'
import { validateChartConfig } from '@olist/contracts'

// Fallback chart strategy: EVERY successful fallback visualization is type
// 'bar' (PRD.md §4.2, Phases.md Phase 3.7). This module is intentionally
// separate from the generic selector so fallback can never drift back to
// line/doughnut/scatter.

const SERIES_COLORS = ['#0F766E', '#2563EB', '#B45309', '#7C3AED', '#0F766E']

const FALLBACK_REASON =
  'Bar chart used because fallback mode is intentionally limited to bar visualizations.'

function bar(
  id: string,
  title: string,
  description: string,
  labels: string[],
  label: string,
  values: Array<number | null>,
  horizontal = false,
  ascendingNote = false
): ChartConfig {
  const finite = values.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null))
  const config = validateChartConfig({
    id,
    type: 'bar',
    title,
    description,
    data: {
      labels,
      datasets: [
        {
          label,
          data: finite,
          backgroundColor: SERIES_COLORS[0],
        },
      ],
    },
    options: horizontal ? { indexAxis: 'y', responsive: true } : { responsive: true },
  })
  void ascendingNote
  return config
}

export interface FallbackChartResult {
  options: ChartConfig[]
  chartType: 'bar'
  chartReason: string
}

function rankEntities(data: NormalizedData, kind: 'ranking' | 'correlation'): Array<{ key: string; label: string }> {
  if (kind === 'ranking' && data.kind === 'ranking') {
    return data.entities.map((e) => ({ key: e.key, label: e.label }))
  }
  if (kind === 'correlation' && data.kind === 'correlation') {
    return data.entities.map((e) => ({ key: e.key, label: e.label }))
  }
  return []
}

export function fallbackChartOptions(data: NormalizedData, intentId: string): FallbackChartResult {
  switch (data.kind) {
    case 'time_series': {
      if (data.series.length === 1) {
        const s = data.series[0]!
        const options = [bar('fallback-bar-series', s.label, `${s.label} (${s.unit})`, data.periods, `${s.label} (${s.unit})`, s.values)]
        return { options, chartType: 'bar', chartReason: FALLBACK_REASON }
      }
      // Q8: two series with different units -> separate bar panels
      const options = data.series.map((s) =>
        bar(`fallback-bar-${s.key}`, s.label, `${s.label} (${s.unit})`, data.periods, `${s.label} (${s.unit})`, s.values)
      )
      return {
        options,
        chartType: 'bar',
        chartReason:
          'Bar chart used because fallback mode is intentionally limited to bar visualizations. Orders (count) and review score (stars) are shown in separate bar panels with separate scales; they are never combined on one shared axis.',
      }
    }
    case 'ranking': {
      const entities = rankEntities(data, 'ranking')
      const horizontal = entities.length <= 15
      const options = [
        bar(
          'fallback-bar-ranking',
          data.metricLabel,
          `Ranked by ${data.metricLabel} (${data.unit}), ${data.direction === 'desc' ? 'descending' : 'ascending'}`,
          entities.map((e) => e.label),
          `${data.metricLabel} (${data.unit})`,
          data.entities.map((e) => e.metricValue),
          horizontal
        ),
      ]
      return { options, chartType: 'bar', chartReason: FALLBACK_REASON }
    }
    case 'composition': {
      const options = [
        bar(
          'fallback-bar-composition',
          'Payment value share',
          'Share of payment value by method (overall denominator; Other aggregates the remaining methods)',
          data.parts.map((p) => p.label),
          `Payment value (${data.unit})`,
          data.parts.map((p) => Number(Number(p.value).toFixed(2)))
        ),
      ]
      return { options, chartType: 'bar', chartReason: FALLBACK_REASON }
    }
    case 'distribution': {
      const options = [
        bar(
          'fallback-bar-distribution',
          'Review score distribution',
          'Review counts per score (1-5)',
          data.buckets.map((b) => b.label),
          'Review count',
          data.buckets.map((b) => b.count)
        ),
      ]
      return { options, chartType: 'bar', chartReason: FALLBACK_REASON }
    }
    case 'correlation': {
      if (intentId === 'q9_seller_delivery_vs_reviews') {
        const entities = rankEntities(data, 'correlation')
        const labels = entities.map((e) => `${e.key.slice(0, 8)}`)
        const options = [
          bar(
            'fallback-bar-q9-days',
            'Average delivery days (10 fastest sellers)',
            'Limited descriptive comparison only; not a correlation test',
            labels,
            'Days',
            data.entities.map((e) => e.x)
          ),
          bar(
            'fallback-bar-q9-score',
            'Average review score (same sellers)',
            'Limited descriptive comparison only; not a correlation test',
            labels,
            'Stars',
            data.entities.map((e) => e.y)
          ),
        ]
        return {
          options,
          chartType: 'bar',
          chartReason:
            'Bar chart used because fallback mode is intentionally limited to bar visualizations. This is a clearly labeled limited bar comparison of the 10 fastest-delivering sellers — descriptive only, not a correlation or causal analysis.',
        }
      }
      // Q10: delay and review score side by side by state -> separate panels
      const entities = rankEntities(data, 'correlation')
      const labels = entities.map((e) => e.label)
      const options = [
        bar('fallback-bar-q10-delay', 'Average delivery delay by state', 'Positive means late (days)', labels, 'Days', data.entities.map((e) => e.x)),
        bar('fallback-bar-q10-score', 'Average review score by state', 'Stars', labels, 'Stars', data.entities.map((e) => e.y)),
      ]
      return {
        options,
        chartType: 'bar',
        chartReason:
          'Bar chart used because fallback mode is intentionally limited to bar visualizations. Delay (days) and review score (stars) are shown in separate bar panels with separate scales; they are never combined on one shared axis.',
      }
    }
  }
}
