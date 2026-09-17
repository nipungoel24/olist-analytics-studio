import { describe, it, expect } from 'vitest'
import type { NormalizedData } from '@olist/contracts'
import { buildInsight, monthLabel } from './insight.js'

const timeSeries: NormalizedData = {
  kind: 'time_series',
  periods: ['2017-01-01T00:00:00.000Z', '2017-11-01T00:00:00.000Z', '2017-12-01T00:00:00.000Z'],
  series: [{ key: 'revenue', label: 'Revenue', unit: 'BRL', values: [100, 900, 800] }],
}

const ranking: NormalizedData = {
  kind: 'ranking',
  entities: [
    { key: 'a', label: 'bed_bath_table', metricValue: 10 },
    { key: 'b', label: 'health_beauty', metricValue: 30 },
  ],
  metricLabel: 'Revenue',
  unit: 'BRL',
  direction: 'desc',
}

const composition: NormalizedData = {
  kind: 'composition',
  parts: [
    { key: 'credit_card', label: 'credit_card', value: 700, share: 0.7 },
    { key: 'boleto', label: 'boleto', value: 300, share: 0.3 },
  ],
  total: 1000,
  unit: 'BRL',
  denominatorNote: 'Overall denominator',
}

const distribution: NormalizedData = {
  kind: 'distribution',
  buckets: [
    { label: '1 star', count: 10 },
    { label: '2 stars', count: 5 },
    { label: '3 stars', count: 7 },
    { label: '4 stars', count: 20 },
    { label: '5 stars', count: 30 },
  ],
  total: 72,
  unit: 'count',
}

const q9corr: NormalizedData = {
  kind: 'correlation',
  entities: [
    { key: 's1', label: 's1', x: 2, y: 4.5 },
    { key: 's2', label: 's2', x: 3, y: 4.0 },
    { key: 's3', label: 's3', x: 4, y: 4.8 },
    { key: 's4', label: 's4', x: 5, y: 4.2 },
    { key: 's5', label: 's5', x: 10, y: 3.5 },
    { key: 's6', label: 's6', x: 12, y: 3.0 },
  ],
  xLabel: 'Average delivery days',
  yLabel: 'Average review score',
  xUnit: 'days',
  yUnit: 'stars',
}

describe('insight generation', () => {
  it('time series: factual max-month sentence with real numeric value', () => {
    const r = buildInsight(timeSeries, 'q1_monthly_revenue_trend')
    expect(r.text).toContain('November 2017')
    expect(r.text).toContain('900')
    expect(r.evidence[0]).toMatchObject({ operation: 'max', metric: 'revenue', value: 900 })
  })

  it('ranking: top entity sentence', () => {
    const r = buildInsight(ranking, 'q2_top_revenue_categories')
    expect(r.text).toContain('health_beauty')
    expect(r.text).toContain('30')
    expect(r.evidence[0]).toMatchObject({ operation: 'max', value: 30 })
  })

  it('composition: share sentence with percent', () => {
    const r = buildInsight(composition, 'q4_payment_share')
    expect(r.text).toContain('Credit cards')
    expect(r.text).toContain('70.0%')
  })

  it('distribution: most common score sentence', () => {
    const r = buildInsight(distribution, 'q6_electronics_review_distribution')
    expect(r.text).toContain('5-star')
    expect(r.text).toContain('30')
  })

  it('deterministic: repeated runs produce identical output', () => {
    const a = buildInsight(timeSeries, 'q1_monthly_revenue_trend')
    const b = buildInsight(timeSeries, 'q1_monthly_revenue_trend')
    expect(a).toEqual(b)
  })

  it('Q9: descriptive comparison, never causal language', () => {
    const r = buildInsight(q9corr, 'q9_seller_delivery_vs_reviews')
    expect(r.text).toBeTruthy()
    const lower = r.text!.toLowerCase()
    expect(lower).not.toContain('cause')
    expect(lower).not.toContain('correlation test')
    expect(lower).not.toContain('significant')
    expect(lower).toContain('descriptive')
    expect(r.evidence.every((e) => e.operation === 'descriptive_comparison')).toBe(true)
  })

  it('monthLabel is locale-independent', () => {
    expect(monthLabel('2017-01-01T00:00:00.000Z')).toBe('January 2017')
    expect(monthLabel('2017-12-15T00:00:00.000Z')).toBe('December 2017')
  })
})
