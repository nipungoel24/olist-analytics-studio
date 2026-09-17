import { describe, it, expect } from 'vitest'
import { validateLLMInsight } from '@olist/api/analysis/insight-validator'
import type { NormalizedData, InsightEvidence } from '@olist/contracts'

// Phase 4 insight validation evidence: three explicit cases.

function makeRankingData(labels: string[]): NormalizedData {
  return {
    kind: 'ranking',
    title: 'Revenue by Category',
    unit: 'BRL',
    metricLabel: 'Revenue',
    entities: labels.map((label, i) => ({ label, value: 1000 - i * 100 })),
  }
}

function makeCorrelationData(): NormalizedData {
  return {
    kind: 'correlation',
    title: 'Delivery Days vs Review Score',
    unit: 'mixed',
    metricLabel: 'Delivery & Reviews',
    x: { label: 'Delivery Days', unit: 'days' },
    y: { label: 'Review Score', unit: 'stars' },
    points: [
      { x: 5, y: 4.5, entity: 'seller_1' },
      { x: 10, y: 3.8, entity: 'seller_2' },
    ],
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

describe('Phase 4 insight validation evidence', () => {
  it('A: valid insight accepted', () => {
    const data = makeRankingData(['Bed Bath Table', 'Furniture Decor', 'Sports Leisure'])
    const evidence = makeEvidence([150000, 120000, 90000])

    const llmInsight = 'Bed Bath Table leads with 150000 BRL in revenue, followed by Furniture Decor at 120000 BRL.'
    const result = validateLLMInsight(llmInsight, data, evidence)

    expect(result).not.toBeNull()
    expect(result).toBe(llmInsight)
  })

  it('B: invented number rejected', () => {
    const data = makeRankingData(['Bed Bath Table', 'Furniture Decor'])
    const evidence = makeEvidence([150000, 120000])

    const llmInsight = 'Bed Bath Table generated 999999 BRL while Furniture Decor had 888888 BRL and Electronics had 777777 BRL.'
    const result = validateLLMInsight(llmInsight, data, evidence)

    // None of the numbers match evidence → rejected
    expect(result).toBeNull()
  })

  it('C: causal Q9 statement rejected', () => {
    const data = makeCorrelationData()
    const evidence = makeEvidence([5, 4.5, 10, 3.8])

    const llmInsight = 'Faster delivery causes higher customer ratings. The data shows that delivery speed directly influences review scores.'
    const result = validateLLMInsight(llmInsight, data, evidence)

    // Causal language: "causes", "influences" → rejected
    expect(result).toBeNull()
  })
})
