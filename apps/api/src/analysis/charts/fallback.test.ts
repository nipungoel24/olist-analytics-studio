import { describe, it, expect } from 'vitest'
import type { NormalizedData } from '@olist/contracts'
import { fallbackChartOptions } from './fallback.js'
import { selectChartOptions } from './selector.js'

const timeSeries1: NormalizedData = {
  kind: 'time_series',
  periods: ['2017-01', '2017-02'],
  series: [{ key: 'revenue', label: 'Revenue', unit: 'BRL', values: [100, 200] }],
}

const timeSeries2: NormalizedData = {
  kind: 'time_series',
  periods: ['2017-01', '2017-02'],
  series: [
    { key: 'orders', label: 'Orders', unit: 'count', values: [800, 900] },
    { key: 'avg_score', label: 'Average review score', unit: 'stars', values: [4.1, 4.2] },
  ],
}

const ranking: NormalizedData = {
  kind: 'ranking',
  entities: [{ key: 'a', label: 'Alpha', metricValue: 10 }],
  metricLabel: 'Revenue',
  unit: 'BRL',
  direction: 'desc',
}

const composition: NormalizedData = {
  kind: 'composition',
  parts: [
    { key: 'credit_card', label: 'Credit cards', value: 700, share: 0.7 },
    { key: 'other', label: 'Other', value: 300, share: 0.3 },
  ],
  total: 1000,
  unit: 'BRL',
  denominatorNote: 'Overall denominator',
}

const correlation: NormalizedData = {
  kind: 'correlation',
  entities: [
    { key: 's1', label: 's1', x: 5, y: 4.2 },
    { key: 's2', label: 's2', x: 12, y: 3.1 },
  ],
  xLabel: 'Days',
  yLabel: 'Stars',
  xUnit: 'days',
  yUnit: 'stars',
}

const distribution: NormalizedData = {
  kind: 'distribution',
  buckets: [1, 2, 3, 4, 5].map((n) => ({ label: `${n} star`, count: n })),
  total: 15,
  unit: 'count',
}

describe('fallback bar-only strategy', () => {
  it('every successful fallback chart is type bar (single time series)', () => {
    const r = fallbackChartOptions(timeSeries1, 'q1_monthly_revenue_trend')
    expect(r.chartType).toBe('bar')
    expect(r.options.every((o) => o.type === 'bar')).toBe(true)
    expect(r.options).toHaveLength(1)
  })

  it('Q8 mixed units become two separate bar panels, no shared axis', () => {
    const r = fallbackChartOptions(timeSeries2, 'q8_monthly_orders_and_reviews')
    expect(r.chartType).toBe('bar')
    expect(r.options).toHaveLength(2)
    expect(r.options.every((o) => o.type === 'bar')).toBe(true)
    // separate panels: each dataset carries its own unit label
    expect(r.options[0]!.data.datasets[0]!.label).toContain('count')
    expect(r.options[1]!.data.datasets[0]!.label).toContain('stars')
  })

  it('ranking falls back to bar', () => {
    const r = fallbackChartOptions(ranking, 'q2_top_revenue_categories')
    expect(r.options.every((o) => o.type === 'bar')).toBe(true)
  })

  it('composition falls back to bar (not doughnut)', () => {
    const r = fallbackChartOptions(composition, 'q4_payment_share')
    expect(r.options.every((o) => o.type === 'bar')).toBe(true)
  })

  it('distribution falls back to bar (not stacked)', () => {
    const r = fallbackChartOptions(distribution, 'q6_electronics_review_distribution')
    expect(r.options.every((o) => o.type === 'bar')).toBe(true)
    expect(r.options[0]!.data.datasets).toHaveLength(1)
  })

  it('Q9 correlation is a clearly labeled limited two-panel bar comparison', () => {
    const r = fallbackChartOptions(correlation, 'q9_seller_delivery_vs_reviews')
    expect(r.options.every((o) => o.type === 'bar')).toBe(true)
    expect(r.options).toHaveLength(2)
    const allDescriptions = r.options.map((o) => `${o.title} ${o.description ?? ''}`).join(' ')
    expect(allDescriptions.toLowerCase()).toContain('limited')
    expect(allDescriptions.toLowerCase()).toContain('not a correlation')
  })

  it('Q10 delay vs score uses separate bar panels', () => {
    const r = fallbackChartOptions(correlation, 'q10_delay_and_reviews_by_state')
    expect(r.options.every((o) => o.type === 'bar')).toBe(true)
    expect(r.options).toHaveLength(2)
  })
})

describe('normal-mode selector (Phase 4 preparation)', () => {
  it('single metric over time -> line', () => {
    const s = selectChartOptions(timeSeries1)
    expect(s.chartType).toBe('line')
    expect(s.options).toHaveLength(1)
  })

  it('two metrics over time -> dual-axis line', () => {
    const s = selectChartOptions(timeSeries2)
    expect(s.chartType).toBe('line')
    expect(s.options[0]!.type).toBe('line')
    const ids = s.options[0]!.data.datasets.map((d) => d.yAxisID)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('ranking is ambiguous -> exactly two validated options with unique ids', () => {
    const s = selectChartOptions(ranking)
    expect(s.options).toHaveLength(2)
    expect(s.options[0]!.id).not.toBe(s.options[1]!.id)
    expect(s.options.every((o) => o.type === 'bar')).toBe(true)
    expect(s.chartReason.length).toBeGreaterThan(0)
  })

  it('composition -> doughnut', () => {
    const s = selectChartOptions(composition)
    expect(s.chartType).toBe('doughnut')
  })

  it('correlation -> scatter', () => {
    const s = selectChartOptions(correlation)
    expect(s.chartType).toBe('scatter')
  })

  it('distribution -> stacked horizontal bar', () => {
    const s = selectChartOptions(distribution)
    expect(s.chartType).toBe('bar')
    expect(s.options[0]!.options?.indexAxis).toBe('y')
  })
})
