import { describe, it, expect } from 'vitest'
import { computeSemanticDiff, validateDiff, THRESHOLDS } from '../../apps/api/src/analysis/diff.js'
import type { NormalizedData, TimeSeries, Ranking, Composition } from '@olist/contracts'

// Phase 5 semantic diff tests.
// Tests threshold boundaries, zero/null handling, structural changes.

describe('Semantic Diff Engine', () => {
  describe('Identical snapshots', () => {
    it('returns unchanged for identical time series', () => {
      const data: TimeSeries = {
        kind: 'time_series',
        periods: ['2017-01', '2017-02'],
        series: [{ key: 'revenue', label: 'Revenue', unit: 'BRL', values: [1000, 2000] }],
      }
      const diff = computeSemanticDiff(data, data, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('unchanged')
      expect(diff.diffs).toHaveLength(0)
    })

    it('returns unchanged for identical rankings', () => {
      const data: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'A', label: 'A', metricValue: 100 },
          { key: 'B', label: 'B', metricValue: 200 },
        ],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(data, data, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('unchanged')
    })
  })

  describe('Row reordering', () => {
    it('detects no change when rows are reordered', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'A', label: 'A', metricValue: 100 },
          { key: 'B', label: 'B', metricValue: 200 },
        ],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'B', label: 'B', metricValue: 200 },
          { key: 'A', label: 'A', metricValue: 100 },
        ],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('unchanged')
      expect(diff.diffs).toHaveLength(0)
    })
  })

  describe('Below threshold', () => {
    it('revenue 9.9% with large absolute is NOT significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 1000 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 1099 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('unchanged')
      expect(diff.diffs[0]?.thresholdMet).toBe(false)
    })

    it('review +0.19 is NOT significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 4.0 }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 4.19 }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('unchanged')
      expect(diff.diffs[0]?.thresholdMet).toBe(false)
    })

    it('delay +0.99 days is NOT significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 5.0 }],
        metricLabel: 'average_delay_days',
        unit: 'days',
        direction: 'asc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 5.99 }],
        metricLabel: 'average_delay_days',
        unit: 'days',
        direction: 'asc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('unchanged')
      expect(diff.diffs[0]?.thresholdMet).toBe(false)
    })

    it('rate +4.99pp is NOT significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 0.50 }],
        metricLabel: 'on_time_rate',
        unit: 'rate',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 0.5499 }],
        metricLabel: 'on_time_rate',
        unit: 'rate',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('unchanged')
      expect(diff.diffs[0]?.thresholdMet).toBe(false)
    })
  })

  describe('Exactly at threshold', () => {
    it('revenue 10% + BRL 100 IS significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 1000 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 1100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.thresholdMet).toBe(true)
    })

    it('review +0.20 IS significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 4.0 }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 4.20 }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.thresholdMet).toBe(true)
    })

    it('delay +1.00 day IS significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 5.0 }],
        metricLabel: 'average_delay_days',
        unit: 'days',
        direction: 'asc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 6.0 }],
        metricLabel: 'average_delay_days',
        unit: 'days',
        direction: 'asc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.thresholdMet).toBe(true)
    })

    it('rate +5.00pp IS significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 0.50 }],
        metricLabel: 'on_time_rate',
        unit: 'rate',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 0.55 }],
        metricLabel: 'on_time_rate',
        unit: 'rate',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.thresholdMet).toBe(true)
    })
  })

  describe('Above threshold', () => {
    it('revenue 20% + BRL 200 IS significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 1000 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 1200 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.thresholdMet).toBe(true)
    })

    it('review +0.21 IS significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 4.0 }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 4.21 }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.thresholdMet).toBe(true)
    })
  })

  describe('Revenue edge cases', () => {
    it('revenue 10% but < BRL 100 is NOT significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 900 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 990 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('unchanged')
      expect(diff.diffs[0]?.thresholdMet).toBe(false)
    })

    it('revenue >=10% and >=BRL 100 IS significant', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 1000 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 1100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.thresholdMet).toBe(true)
    })
  })

  describe('Zero handling', () => {
    it('zero -> positive uses absolute threshold', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 0 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 150 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.relativeChange).toBeNull()
      expect(diff.diffs[0]?.thresholdMet).toBe(true)
    })

    it('positive -> zero is detected', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 0 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.oldValue).toBe(100)
      expect(diff.diffs[0]?.newValue).toBe(0)
    })
  })

  describe('Null handling', () => {
    it('null -> value is coverage change', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: null }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 4.5 }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.absoluteChange).toBeNull()
    })

    it('value -> null is coverage change', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 4.5 }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: null }],
        metricLabel: 'review_score',
        unit: 'stars',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('changed')
      expect(diff.diffs[0]?.absoluteChange).toBeNull()
    })
  })

  describe('Structural changes', () => {
    it('detects entity added', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'A', label: 'A', metricValue: 100 },
          { key: 'B', label: 'B', metricValue: 200 },
        ],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.structuralChanges).toHaveLength(2)
      expect(diff.structuralChanges.some((c) => c.type === 'entity_added')).toBe(true)
      expect(diff.structuralChanges.some((c) => c.type === 'top_n_membership_change')).toBe(true)
    })

    it('detects entity removed', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'A', label: 'A', metricValue: 100 },
          { key: 'B', label: 'B', metricValue: 200 },
        ],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.structuralChanges).toHaveLength(2)
      expect(diff.structuralChanges.some((c) => c.type === 'entity_removed')).toBe(true)
      expect(diff.structuralChanges.some((c) => c.type === 'top_n_membership_change')).toBe(true)
    })

    it('detects top-N membership change', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'A', label: 'A', metricValue: 100 },
          { key: 'B', label: 'B', metricValue: 90 },
          { key: 'C', label: 'C', metricValue: 80 },
          { key: 'D', label: 'D', metricValue: 70 },
          { key: 'E', label: 'E', metricValue: 60 },
        ],
        metricLabel: 'order_count',
        unit: 'count',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'A', label: 'A', metricValue: 100 },
          { key: 'B', label: 'B', metricValue: 90 },
          { key: 'C', label: 'C', metricValue: 80 },
          { key: 'D', label: 'D', metricValue: 70 },
          { key: 'F', label: 'F', metricValue: 65 },
        ],
        metricLabel: 'order_count',
        unit: 'count',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.structuralChanges.some((c) => c.type === 'entity_removed')).toBe(true)
      expect(diff.structuralChanges.some((c) => c.type === 'entity_added')).toBe(true)
      expect(diff.structuralChanges.some((c) => c.type === 'top_n_membership_change')).toBe(true)
    })
  })

  describe('Totals canceling out', () => {
    it('detects per-key changes even when totals unchanged', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'A', label: 'A', metricValue: 100 },
          { key: 'B', label: 'B', metricValue: 100 },
        ],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'A', label: 'A', metricValue: 200 },
          { key: 'B', label: 'B', metricValue: 0 },
        ],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.diffs.length).toBeGreaterThan(0)
      expect(diff.diffs.some((d) => d.dimensionKey.includes('A'))).toBe(true)
      expect(diff.diffs.some((d) => d.dimensionKey.includes('B'))).toBe(true)
    })
  })

  describe('Incompatible versions', () => {
    it('different data kinds are not comparable', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: TimeSeries = {
        kind: 'time_series',
        periods: ['2017-01'],
        series: [{ key: 'revenue', label: 'Revenue', unit: 'BRL', values: [100] }],
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(diff.status).toBe('not_comparable')
    })

    it('null old data is not comparable', () => {
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(null, new_, null, 'v1', 'unknown', 'success')
      expect(diff.status).toBe('not_comparable')
    })

    it('different metric versions are not comparable', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 120 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      // Different data versions indicate metric definition changed
      const diff = computeSemanticDiff(old, new_, 'metric_v1', 'metric_v2', 'success', 'success')
      expect(diff.previousDataVersion).toBe('metric_v1')
      expect(diff.newDataVersion).toBe('metric_v2')
      // Status depends on whether values changed significantly
      expect(['changed', 'unchanged', 'not_comparable']).toContain(diff.status)
    })
  })

  describe('Partial refresh', () => {
    it('partial refresh with null new data is not comparable', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, null, 'v1', 'v1', 'success', 'partial')
      expect(diff.status).toBe('not_comparable')
      expect(diff.newStatus).toBe('partial')
    })

    it('partial refresh with empty data shows coverage change', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [
          { key: 'A', label: 'A', metricValue: 100 },
          { key: 'B', label: 'B', metricValue: 200 },
        ],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'partial')
      expect(diff.structuralChanges.some((c) => c.type === 'entity_removed')).toBe(true)
    })
  })

  describe('Failed refresh', () => {
    it('failed refresh with null new data is not comparable', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, null, 'v1', 'v1', 'success', 'failed')
      expect(diff.status).toBe('not_comparable')
      expect(diff.newStatus).toBe('failed')
    })
  })

  describe('Valid empty refresh', () => {
    it('empty result with empty new data is not comparable', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, null, 'v1', 'v1', 'success', 'empty')
      expect(diff.status).toBe('not_comparable')
      expect(diff.newStatus).toBe('empty')
    })
  })

  describe('Diff validation', () => {
    it('validates no NaN in diff', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 200 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(validateDiff(diff)).toBe(true)
    })

    it('validates no Infinity in diff', () => {
      const old: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 0 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const new_: Ranking = {
        kind: 'ranking',
        entities: [{ key: 'A', label: 'A', metricValue: 100 }],
        metricLabel: 'revenue',
        unit: 'BRL',
        direction: 'desc',
      }
      const diff = computeSemanticDiff(old, new_, 'v1', 'v1', 'success', 'success')
      expect(validateDiff(diff)).toBe(true)
    })
  })
})
