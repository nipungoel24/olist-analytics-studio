import type {
  ToolResult,
  NormalizedData,
  TimeSeries,
  Ranking,
  Composition,
  Correlation,
  Distribution,
} from '@olist/contracts'
import type { MergedRow } from './merge.js'

// Tool-specific output -> normalized analytical shapes.
// Chart and insight generation never touch raw MCP rows.

export function fromTrends(
  result: ToolResult,
  seriesKey: string,
  seriesLabel: string,
  unit: string
): TimeSeries {
  const rows = result.data as Array<Record<string, unknown>>
  const periods: string[] = []
  const values: Array<number | null> = []
  for (const row of rows) {
    const period = row['period']
    const value = row['value']
    periods.push(String(period))
    values.push(typeof value === 'number' ? value : null)
  }
  return {
    kind: 'time_series',
    periods,
    series: [{ key: seriesKey, label: seriesLabel, unit, values }],
  }
}

export function fromRanking(
  result: ToolResult,
  options: {
    keyField: string
    labelField: string
    valueField: string
    metricLabel: string
    unit: string
    direction: 'asc' | 'desc'
    extraFields?: string[]
  }
): Ranking {
  const rows = result.data as Array<Record<string, unknown>>
  const entities = rows.map((row) => {
    const extra: Record<string, unknown> = {}
    for (const field of options.extraFields ?? []) {
      extra[field] = row[field]
    }
    return {
      key: String(row[options.keyField]),
      label: String(row[options.labelField]),
      metricValue: typeof row[options.valueField] === 'number' ? Number(row[options.valueField]) : null,
      extra,
    }
  })
  return {
    kind: 'ranking',
    entities,
    metricLabel: options.metricLabel,
    unit: options.unit,
    direction: options.direction,
  }
}

// Score distribution: fill missing 1-5 buckets with zero ONLY when the total
// cohort exists and zero is semantically known (PRD.md §7, Architecture.md §7).
export function fromScoreDistribution(result: ToolResult): Distribution {
  const rows = result.data as Array<Record<string, unknown>>
  const counts = new Map<number, number>()
  for (const row of rows) {
    const score = Number(row['score'])
    const count = Number(row['review_count'] ?? row['count'] ?? 0)
    counts.set(score, count)
  }
  const total = [...counts.values()].reduce((s, c) => s + c, 0)
  // Missing 1-5 buckets are known-zero only when the cohort exists (total > 0).
  // The caller treats total === 0 as an empty result (chart = null).
  const buckets = [1, 2, 3, 4, 5].map((score) => ({
    label: `${score} star${score === 1 ? '' : 's'}`,
    count: total > 0 ? (counts.get(score) ?? 0) : 0,
  }))
  return { kind: 'distribution', buckets, total, unit: 'count' }
}

export function fromComposition(result: ToolResult, otherKeys: string[] = []): Composition {
  const rows = result.data as Array<Record<string, unknown>>
  let total = 0
  let otherValue = 0
  const kept: Array<Record<string, unknown>> = []
  for (const row of rows) {
    const key = String(row['group_key'])
    const value = Number(row['metric_value'] ?? 0)
    total += value
    if (otherKeys.includes(key)) {
      otherValue += value
    } else {
      kept.push(row)
    }
  }
  const parts = kept.map((row) => ({
    key: String(row['group_key']),
    label: String(row['group_key']),
    value: Number(row['metric_value'] ?? 0),
    share: total > 0 ? Number(row['metric_value'] ?? 0) / total : undefined,
  }))
  if (otherValue > 0 || otherKeys.length > 0) {
    parts.push({
      key: 'other',
      label: 'Other',
      value: otherValue,
      share: total > 0 ? otherValue / total : undefined,
    })
  }
  return {
    kind: 'composition',
    parts,
    total,
    unit: 'BRL',
    denominatorNote: 'Overall payment-value share across all payment methods',
  }
}

// Multi-tool merged-shape builders

export function buildQ7Ranking(merged: MergedRow[]): Ranking {
  const entities = merged.map((m) => {
    const cat = m.left?.['category_english'] ?? m.key
    const avgScore = m.right?.['metric_value']
    const orderCount = m.left?.['metric_value']
    return {
      key: String(cat),
      label: String(cat),
      metricValue: typeof avgScore === 'number' ? Number(avgScore) : null,
      extra: {
        order_count: typeof orderCount === 'number' ? Number(orderCount) : null,
        review_count: typeof m.right?.['review_count'] === 'number' ? Number(m.right?.['review_count']) : null,
      },
    }
  })
  entities.sort((a, b) => {
    const av = a.metricValue ?? Number.NEGATIVE_INFINITY
    const bv = b.metricValue ?? Number.NEGATIVE_INFINITY
    if (bv !== av) return bv - av
    return a.key.localeCompare(b.key)
  })
  return {
    kind: 'ranking',
    entities,
    metricLabel: 'Average review score',
    unit: 'stars',
    direction: 'desc',
  }
}

export function buildQ8TimeSeries(merged: MergedRow[]): TimeSeries {
  const periods: string[] = []
  const orders: Array<number | null> = []
  const scores: Array<number | null> = []
  for (const m of merged) {
    const period = m.left?.['period'] ?? m.right?.['group_key']
    const orderValue = m.left?.['value']
    const scoreValue = m.right?.['metric_value']
    periods.push(String(period))
    orders.push(typeof orderValue === 'number' ? Number(orderValue) : null)
    scores.push(typeof scoreValue === 'number' ? Number(scoreValue) : null)
  }
  return {
    kind: 'time_series',
    periods,
    series: [
      { key: 'orders', label: 'Delivered orders', unit: 'count', values: orders },
      { key: 'avg_score', label: 'Average review score', unit: 'stars', values: scores },
    ],
  }
}

export function buildQ9Correlation(merged: MergedRow[]): Correlation {
  const entities = merged.map((m) => {
    const x = m.left?.['metric_value']
    const y = m.right?.['metric_value']
    return {
      key: m.key,
      label: m.key,
      x: typeof x === 'number' ? Number(x) : null,
      y: typeof y === 'number' ? Number(y) : null,
    }
  })
  return {
    kind: 'correlation',
    entities,
    xLabel: 'Average delivery days',
    yLabel: 'Average review score',
    xUnit: 'days',
    yUnit: 'stars',
    description: 'Limited descriptive comparison of the 10 fastest-delivering sellers; no correlation or causal claim',
  }
}

export function buildQ10Correlation(merged: MergedRow[]): Correlation {
  const entities = merged
    .map((m) => {
      const x = m.left?.['metric_value']
      const y = m.right?.['metric_value']
      return {
        key: m.key,
        label: m.key,
        x: typeof x === 'number' ? Number(x) : null,
        y: typeof y === 'number' ? Number(y) : null,
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key))
  return {
    kind: 'correlation',
    entities,
    xLabel: 'Average delivery delay',
    yLabel: 'Average review score',
    xUnit: 'days',
    yUnit: 'stars',
    description: 'Delivery delay and review score side by side by destination state',
  }
}

export function validateShapes(data: NormalizedData): NormalizedData {
  return data
}
