import { describe, it, expect } from 'vitest'
import { validateLLMInsight } from './insight-validator.js'
import type { NormalizedData, InsightEvidence } from '@olist/contracts'

function makeRankingData(labels: string[]): NormalizedData {
  return {
    kind: 'ranking',
    title: 'Test',
    unit: 'BRL',
    metricLabel: 'Revenue',
    entities: labels.map((label) => ({ label, value: Math.round(Math.random() * 1000) })),
  }
}

function makeTimeSeriesData(): NormalizedData {
  return {
    kind: 'time_series',
    title: 'Monthly Revenue',
    unit: 'BRL',
    metricLabel: 'Revenue',
    timeUnit: 'month',
    series: [{ label: 'Revenue', points: [{ x: '2017-01', y: 100 }, { x: '2017-02', y: 200 }] }],
  }
}

function makeEvidence(values: number[]): InsightEvidence[] {
  return values.map((value) => ({
    tool: 'order_trends',
    field: 'metric_value',
    value,
    description: `Value ${value}`,
  }))
}

describe('validateLLMInsight', () => {
  it('returns null when normalizedData is null', () => {
    const result = validateLLMInsight('Revenue is 1000', null, makeEvidence([1000]))
    expect(result).toBeNull()
  })

  it('returns null when evidence is empty', () => {
    const data = makeRankingData(['Cat A'])
    const result = validateLLMInsight('Revenue is 1000', data, [])
    expect(result).toBeNull()
  })

  it('returns null when llmText is empty', () => {
    const data = makeRankingData(['Cat A'])
    const result = validateLLMInsight('', data, makeEvidence([1000]))
    expect(result).toBeNull()
  })

  it('accepts a valid insight with supported numbers', () => {
    const data = makeRankingData(['Cat A'])
    const result = validateLLMInsight('Cat A generated 1500 BRL', data, makeEvidence([1500]))
    expect(result).toBe('Cat A generated 1500 BRL')
  })

  it('rejects causal language', () => {
    const data = makeRankingData(['Cat A'])
    const result = validateLLMInsight('Faster delivery causes better reviews', data, makeEvidence([4.5]))
    expect(result).toBeNull()
  })

  it('rejects "leads to" pattern', () => {
    const data = makeRankingData(['A'])
    const result = validateLLMInsight('This leads to higher scores', data, makeEvidence([5]))
    expect(result).toBeNull()
  })

  it('rejects "results in" pattern', () => {
    const data = makeRankingData(['A'])
    const result = validateLLMInsight('Faster shipping results in happier customers', data, makeEvidence([5]))
    expect(result).toBeNull()
  })

  it('rejects "influences" pattern', () => {
    const data = makeRankingData(['A'])
    const result = validateLLMInsight('Delivery speed influences review scores', data, makeEvidence([4]))
    expect(result).toBeNull()
  })

  it('rejects unsupported numeric claims (too many unmatched)', () => {
    const data = makeTimeSeriesData()
    const result = validateLLMInsight(
      'Revenue was 99999 in January and 88888 in February and 77777 in March',
      data,
      makeEvidence([100, 200]),
    )
    expect(result).toBeNull()
  })

  it('accepts when most numbers match evidence', () => {
    const data = makeTimeSeriesData()
    const result = validateLLMInsight(
      'Revenue was 100 in January and 200 in February',
      data,
      makeEvidence([100, 200]),
    )
    expect(result).toBe('Revenue was 100 in January and 200 in February')
  })

  it('trims the result', () => {
    const data = makeRankingData(['A'])
    const result = validateLLMInsight('  Hello world  ', data, makeEvidence([1]))
    expect(result).toBe('Hello world')
  })
})
