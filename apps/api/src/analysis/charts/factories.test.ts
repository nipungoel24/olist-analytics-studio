import { describe, it, expect } from 'vitest'
import type { NormalizedData } from '@olist/contracts'
import {
  lineTimeSeries,
  dualAxisLineTimeSeries,
  horizontalBarRanking,
  verticalBarComparison,
  doughnutComposition,
  scatterCorrelation,
  stackedScoreDistribution,
} from './factories.js'
import { assertJsonRoundTrip } from '@olist/contracts'

const timeSeries: NormalizedData = {
  kind: 'time_series',
  periods: ['2017-01', '2017-02', '2017-03'],
  series: [{ key: 'revenue', label: 'Revenue', unit: 'BRL', values: [100, 200, 150] }],
}

const twoSeries: NormalizedData = {
  kind: 'time_series',
  periods: ['2017-01', '2017-02'],
  series: [
    { key: 'orders', label: 'Orders', unit: 'count', values: [800, 900] },
    { key: 'avg_score', label: 'Average review score', unit: 'stars', values: [4.1, 4.2] },
  ],
}

const ranking: NormalizedData = {
  kind: 'ranking',
  entities: [
    { key: 'a', label: 'Alpha', metricValue: 10 },
    { key: 'b', label: 'Beta', metricValue: 20 },
  ],
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
    { key: 's3', label: 's3', x: null, y: 4.0 },
  ],
  xLabel: 'Average delivery days',
  yLabel: 'Average review score',
  xUnit: 'days',
  yUnit: 'stars',
}

const distribution: NormalizedData = {
  kind: 'distribution',
  buckets: [
    { label: '1 star', count: 10 },
    { label: '2 stars', count: 0 },
    { label: '3 stars', count: 5 },
    { label: '4 stars', count: 20 },
    { label: '5 stars', count: 30 },
  ],
  total: 65,
  unit: 'count',
}

describe('chart factories', () => {
  it('line: single metric over time -> line with one dataset', () => {
    const cfg = lineTimeSeries(timeSeries)
    expect(cfg.type).toBe('line')
    expect(cfg.data.datasets).toHaveLength(1)
    expect(cfg.data.labels).toEqual(timeSeries.periods)
    expect(cfg.data.datasets[0]!.data).toEqual([100, 200, 150])
  })

  it('dual-axis line: separate named yAxisIDs when units differ', () => {
    const cfg = dualAxisLineTimeSeries(twoSeries)
    expect(cfg.type).toBe('line')
    expect(cfg.data.datasets).toHaveLength(2)
    const ids = cfg.data.datasets.map((d) => d.yAxisID)
    expect(ids[0]).not.toBe(ids[1])
    expect(Object.keys(cfg.options?.scales ?? {})).toHaveLength(2)
  })

  it('horizontal bar ranking keeps deterministic order', () => {
    const cfg = horizontalBarRanking(ranking)
    expect(cfg.type).toBe('bar')
    expect(cfg.options?.indexAxis).toBe('y')
    expect(cfg.data.labels).toEqual(['Alpha', 'Beta'])
  })

  it('vertical category bar uses normal orientation', () => {
    const cfg = verticalBarComparison(ranking)
    expect(cfg.type).toBe('bar')
    expect(cfg.options?.indexAxis).toBeUndefined()
  })

  it('doughnut composition uses canonical values', () => {
    const cfg = doughnutComposition(composition)
    expect(cfg.type).toBe('doughnut')
    expect(cfg.data.datasets[0]!.data).toEqual([700, 300])
  })

  it('scatter has exactly one point per entity and preserves identity', () => {
    const cfg = scatterCorrelation(correlation)
    expect(cfg.type).toBe('scatter')
    const points = cfg.data.datasets[0]!.data as Array<{ x: number | null; y: number | null; key: string }>
    expect(points).toHaveLength(3)
    expect(points.map((p) => p.key)).toEqual(['s1', 's2', 's3'])
    expect(points[2]!.x).toBeNull()
  })

  it('score distribution is a stacked horizontal bar with five datasets', () => {
    const cfg = stackedScoreDistribution(distribution)
    expect(cfg.type).toBe('bar')
    expect(cfg.options?.indexAxis).toBe('y')
    expect(cfg.data.datasets).toHaveLength(5)
    expect(cfg.data.datasets.every((d) => d.stack === 'score')).toBe(true)
    expect(cfg.options?.scales?.x?.stacked).toBe(true)
    expect(cfg.options?.scales?.y?.stacked).toBe(true)
    // missing bucket stays a known-zero count
    expect((cfg.data.datasets[1]!.data as number[])[0]).toBe(0)
  })

  it('every config survives JSON round-trip and schema validation', () => {
    const configs = [
      lineTimeSeries(timeSeries),
      dualAxisLineTimeSeries(twoSeries),
      horizontalBarRanking(ranking),
      verticalBarComparison(ranking),
      doughnutComposition(composition),
      scatterCorrelation(correlation),
      stackedScoreDistribution(distribution),
    ]
    for (const cfg of configs) {
      const roundTripped = assertJsonRoundTrip(cfg)
      expect(roundTripped).toEqual(cfg)
    }
  })

  it('serialized configs contain no functions', () => {
    const configs = [
      lineTimeSeries(timeSeries),
      dualAxisLineTimeSeries(twoSeries),
      horizontalBarRanking(ranking),
      verticalBarComparison(ranking),
      doughnutComposition(composition),
      scatterCorrelation(correlation),
      stackedScoreDistribution(distribution),
    ]
    for (const cfg of configs) {
      const serialized = JSON.stringify(cfg)
      expect(serialized).not.toContain('=>')
      expect(serialized).not.toContain('function')
      const parsed = JSON.parse(serialized) as Record<string, unknown>
      expect(JSON.stringify(parsed)).toBe(serialized)
    }
  })
})
