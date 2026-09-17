import type {
  ChartConfig,
  TimeSeries,
  Ranking,
  Composition,
  Correlation,
  Distribution,
} from '@olist/contracts'
import { validateChartConfig } from '@olist/contracts'

// Deterministic chart factories (Phases.md Phase 3.5, PRD.md §7).
// All configs are JSON-safe allowlisted Chart.js structures; the backend owns
// every config and never accepts model-authored chart JSON.

const SERIES_COLOR_VALUES = ['#0F766E', '#2563EB', '#B45309', '#7C3AED', '#0F766E'] as const

function seriesColor(i: number): string {
  return SERIES_COLOR_VALUES[i % SERIES_COLOR_VALUES.length] ?? SERIES_COLOR_VALUES[0]
}

function finiteOrNull(v: number | null): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function build(id: string, type: ChartConfig['type'], title: string, description: string, cfg: Omit<ChartConfig, 'id' | 'type' | 'title' | 'description'>): ChartConfig {
  const config = validateChartConfig({
    id,
    type,
    title,
    description,
    ...cfg,
  })
  return config
}

// 1. One metric over time -> line
export function lineTimeSeries(data: TimeSeries, id = 'line-series'): ChartConfig {
  return build(id, 'line', data.series[0]?.label ?? 'Metric over time', 'Single metric across ordered time periods', {
    data: {
      labels: data.periods,
      datasets: data.series.map((s, i) => ({
        label: `${s.label} (${s.unit})`,
        data: s.values.map(finiteOrNull),
        borderColor: seriesColor(i),
        fill: false,
        tension: 0,
      })),
    },
    options: { responsive: true },
  })
}

// 2. Two metrics over same time axis -> dual-axis line with named axes
export function dualAxisLineTimeSeries(data: TimeSeries, id = 'dual-axis-line'): ChartConfig {
  const axes: Record<string, { type: 'linear'; position: 'left' | 'right'; title: { display: true; text: string } }> = {}
  const datasets = data.series.map((s, i) => {
    const axisId = `y-${s.key}`
    axes[axisId] = {
      type: 'linear',
      position: i === 0 ? 'left' : 'right',
      title: { display: true, text: s.unit },
    }
    return {
      label: `${s.label} (${s.unit})`,
      data: s.values.map(finiteOrNull),
      borderColor: seriesColor(i),
      fill: false,
      tension: 0,
      yAxisID: axisId,
    }
  })
  return build(id, 'line', 'Two metrics over time', 'Separate named y-axes because the units differ', {
    data: { labels: data.periods, datasets },
    options: { responsive: true, scales: axes },
  })
}

// 3. Ranked list by one metric -> horizontal bar
export function horizontalBarRanking(data: Ranking, id = 'ranked-bar', limit?: number): ChartConfig {
  const entities = limit ? data.entities.slice(0, limit) : data.entities
  return build(id, 'bar', `${data.metricLabel} ranking`, `Ranked by ${data.metricLabel} (${data.unit}), ${data.direction === 'desc' ? 'descending' : 'ascending'}`, {
    data: {
      labels: entities.map((e) => e.label),
      datasets: [
        {
          label: `${data.metricLabel} (${data.unit})`,
          data: entities.map((e) => finiteOrNull(e.metricValue)),
          backgroundColor: seriesColor(0),
        },
      ],
    },
    options: { indexAxis: 'y', responsive: true },
  })
}

// 4. Category comparison in one period -> vertical bar
export function verticalBarComparison(data: Ranking, id = 'category-bar'): ChartConfig {
  return build(id, 'bar', `${data.metricLabel} by category`, `Category comparison by ${data.metricLabel} (${data.unit})`, {
    data: {
      labels: data.entities.map((e) => e.label),
      datasets: [
        {
          label: `${data.metricLabel} (${data.unit})`,
          data: data.entities.map((e) => finiteOrNull(e.metricValue)),
          backgroundColor: seriesColor(0),
        },
      ],
    },
    options: { responsive: true },
  })
}

// 5. Part-to-whole -> doughnut (displayed as "Donut")
export function doughnutComposition(data: Composition, id = 'composition-donut'): ChartConfig {
  return build(id, 'doughnut', 'Composition', `Part-to-whole share in ${data.unit}; ${data.denominatorNote}`, {
    data: {
      labels: data.parts.map((p) => p.label),
      datasets: [
        {
          label: `Value (${data.unit})`,
          data: data.parts.map((p) => Number(Number(p.value).toFixed(2))),
          backgroundColor: data.parts.map((_, i) => seriesColor(i)),
        },
      ],
    },
    options: { responsive: true },
  })
}

// 6. Two continuous values per entity -> scatter, exactly one point per entity
export function scatterCorrelation(data: Correlation, id = 'correlation-scatter'): ChartConfig {
  return build(id, 'scatter', `${data.yLabel} vs ${data.xLabel}`, `One point per entity; x = ${data.xLabel} (${data.xUnit}), y = ${data.yLabel} (${data.yUnit})`, {
    data: {
      labels: data.entities.map((e) => e.label),
      datasets: [
        {
          label: `${data.xLabel} vs ${data.yLabel}`,
          data: data.entities.map((e) => ({
            x: finiteOrNull(e.x),
            y: finiteOrNull(e.y),
            key: e.key,
          })),
          backgroundColor: seriesColor(0),
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: { type: 'linear', position: 'bottom', title: { display: true, text: data.xUnit } },
        y: { type: 'linear', position: 'left', title: { display: true, text: data.yUnit } },
      },
    },
  })
}

// 7. 1-5 score distribution -> stacked horizontal bar, one dataset per score
export function stackedScoreDistribution(data: Distribution, id = 'score-distribution'): ChartConfig {
  return build(id, 'bar', 'Review score distribution', 'Stacked horizontal bar with one dataset per score (1-5)', {
    data: {
      labels: ['Reviews'],
      datasets: data.buckets.map((b, i) => ({
        label: b.label,
        data: [b.count],
        backgroundColor: seriesColor(i),
        stack: 'score',
      })),
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      scales: {
        x: { type: 'linear', stacked: true },
        y: { type: 'category', stacked: true },
      },
    },
  })
}
