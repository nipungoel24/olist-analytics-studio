import type { NormalizedData, TimeSeries, Ranking, Composition, Correlation, Distribution } from '@olist/contracts'
import type { SemanticDiff, DiffEntry, StructuralChange } from '@olist/contracts'

// Semantic diff engine for Phase 5 refresh.
// Compares analytical values by stable (dimension_key, metric_id).
// Never compares Chart.js JSON, colors, row ordering, or prose.

// Thresholds from Architecture.md §9
export const THRESHOLDS = {
  revenue: { relative: 0.10, absolute: 100 }, // 10% AND BRL 100
  count: { relative: 0.10, absolute: 5 }, // 10% AND 5
  reviewScore: { absolute: 0.20 }, // 0.20 stars
  duration: { absolute: 1.00 }, // 1 day
  rate: { absolute: 0.05 }, // 5 percentage points
  freight: { absolute: 5.00 }, // BRL 5
} as const

// Extract dimension-metric pairs from NormalizedData
interface DimensionMetric {
  dimensionKey: string
  metricId: string
  value: number | null
}

function extractTimeSeriesData(data: TimeSeries): DimensionMetric[] {
  const result: DimensionMetric[] = []
  for (const period of data.periods) {
    for (const series of data.series) {
      const idx = data.periods.indexOf(period)
      result.push({
        dimensionKey: `period:${period}`,
        metricId: series.key,
        value: series.values[idx] ?? null,
      })
    }
  }
  return result
}

function extractRankingData(data: Ranking): DimensionMetric[] {
  const result: DimensionMetric[] = []
  for (const entity of data.entities) {
    result.push({
      dimensionKey: `entity:${entity.key}`,
      metricId: data.metricLabel,
      value: entity.metricValue,
    })
    // Include extra metrics
    if (entity.extra) {
      for (const [key, value] of Object.entries(entity.extra)) {
        if (typeof value === 'number') {
          result.push({
            dimensionKey: `entity:${entity.key}`,
            metricId: key,
            value,
          })
        }
      }
    }
  }
  return result
}

function extractCompositionData(data: Composition): DimensionMetric[] {
  return data.parts.map((part) => ({
    dimensionKey: `part:${part.key}`,
    metricId: 'value',
    value: part.value,
  }))
}

function extractCorrelationData(data: Correlation): DimensionMetric[] {
  const result: DimensionMetric[] = []
  for (const entity of data.entities) {
    result.push({
      dimensionKey: `entity:${entity.key}`,
      metricId: 'x',
      value: entity.x,
    })
    result.push({
      dimensionKey: `entity:${entity.key}`,
      metricId: 'y',
      value: entity.y,
    })
  }
  return result
}

function extractDistributionData(data: Distribution): DimensionMetric[] {
  return data.buckets.map((bucket) => ({
    dimensionKey: `bucket:${bucket.label}`,
    metricId: 'count',
    value: bucket.count,
  }))
}

function extractDataPoints(data: NormalizedData): DimensionMetric[] {
  switch (data.kind) {
    case 'time_series':
      return extractTimeSeriesData(data)
    case 'ranking':
      return extractRankingData(data)
    case 'composition':
      return extractCompositionData(data)
    case 'correlation':
      return extractCorrelationData(data)
    case 'distribution':
      return extractDistributionData(data)
  }
}

// Detect structural changes (entity added/removed)
function detectStructuralChanges(
  oldData: NormalizedData,
  newData: NormalizedData
): StructuralChange[] {
  const changes: StructuralChange[] = []
  
  const oldKeys = extractDataPoints(oldData).map((d) => d.dimensionKey)
  const newKeys = extractDataPoints(newData).map((d) => d.dimensionKey)
  
  const oldKeySet = new Set(oldKeys)
  const newKeySet = new Set(newKeys)
  
  // Entities removed
  for (const key of oldKeySet) {
    if (!newKeySet.has(key)) {
      changes.push({
        type: 'entity_removed',
        key,
        details: `Dimension ${key} present in old data but missing in new data`,
      })
    }
  }
  
  // Entities added
  for (const key of newKeySet) {
    if (!oldKeySet.has(key)) {
      changes.push({
        type: 'entity_added',
        key,
        details: `Dimension ${key} present in new data but missing in old data`,
      })
    }
  }
  
  // Top-N membership change (for rankings)
  if (oldData.kind === 'ranking' && newData.kind === 'ranking') {
    const oldTopN = oldData.entities.slice(0, 5).map((e) => e.key)
    const newTopN = newData.entities.slice(0, 5).map((e) => e.key)
    if (JSON.stringify(oldTopN) !== JSON.stringify(newTopN)) {
      changes.push({
        type: 'top_n_membership_change',
        key: 'top_n',
        details: `Top-N membership changed: [${oldTopN.join(', ')}] → [${newTopN.join(', ')}]`,
      })
    }
  }
  
  return changes
}

// Determine which threshold to apply based on metric name
function getThreshold(metricId: string): { relative?: number; absolute: number } | null {
  const lower = metricId.toLowerCase()
  
  // Rate/share thresholds (check before duration since "on_time_rate" contains "time")
  if (lower.includes('rate') || lower.includes('share') || lower.includes('percentage') ||
      lower.includes('ratio') || lower.includes('proportion')) {
    return THRESHOLDS.rate
  }
  
  // Review score thresholds
  if (lower.includes('score') || lower.includes('rating') || lower.includes('review')) {
    return THRESHOLDS.reviewScore
  }
  
  // Revenue/money thresholds
  if (lower.includes('revenue') || lower.includes('freight') || lower.includes('payment') || 
      lower.includes('value') || lower.includes('monetary') || lower.includes('total')) {
    return THRESHOLDS.revenue
  }
  
  // Count thresholds
  if (lower.includes('count') || lower.includes('orders') || lower.includes('volume') ||
      lower.includes('quantity') || lower.includes('items')) {
    return THRESHOLDS.count
  }
  
  // Duration/delay thresholds
  if (lower.includes('duration') || lower.includes('delay') || lower.includes('days') ||
      lower.includes('time') || lower.includes('interval')) {
    return THRESHOLDS.duration
  }
  
  // Default: no threshold
  return null
}

// Compute absolute change
function computeAbsoluteChange(oldVal: number | null, newVal: number | null): number | null {
  if (oldVal === null || newVal === null) return null
  return newVal - oldVal
}

// Compute relative change (null for zero→positive)
function computeRelativeChange(oldVal: number | null, newVal: number | null): number | null {
  if (oldVal === null || newVal === null) return null
  if (oldVal === 0) return null // Zero to positive: use absolute threshold
  return (newVal - oldVal) / Math.abs(oldVal)
}

// Check if change meets threshold
function checkThreshold(
  absoluteChange: number | null,
  relativeChange: number | null,
  threshold: { relative?: number; absolute: number }
): { met: boolean; reason: string } {
  if (absoluteChange === null) {
    return { met: false, reason: 'null change' }
  }
  
  const absMet = Math.abs(absoluteChange) >= threshold.absolute
  
  if (threshold.relative !== undefined) {
    if (relativeChange === null) {
      // Zero to positive case
      return {
        met: absMet,
        reason: absMet
          ? `Absolute change ${absoluteChange.toFixed(2)} meets threshold ${threshold.absolute}`
          : `Absolute change ${absoluteChange.toFixed(2)} below threshold ${threshold.absolute}`,
      }
    }
    const relMet = Math.abs(relativeChange) >= threshold.relative
    return {
      met: absMet && relMet,
      reason: `Absolute: ${absoluteChange.toFixed(2)} (threshold ${threshold.absolute}), Relative: ${(relativeChange * 100).toFixed(1)}% (threshold ${threshold.relative * 100}%)`,
    }
  }
  
  // For rates/shares, use absolute threshold only
  return {
    met: absMet,
    reason: `Absolute change ${absoluteChange.toFixed(2)} ${absMet ? 'meets' : 'below'} threshold ${threshold.absolute}`,
  }
}

// Main semantic diff computation
export function computeSemanticDiff(
  oldData: NormalizedData | null,
  newData: NormalizedData | null,
  previousDataVersion: string | null,
  newDataVersion: string | null,
  previousStatus: string,
  newStatus: string
): SemanticDiff {
  // Handle null/incompatible cases
  if (!oldData || !newData) {
    return {
      status: 'not_comparable',
      diffs: [],
      structuralChanges: [],
      previousDataVersion,
      newDataVersion,
      previousStatus,
      newStatus,
    }
  }
  
  // Different data kinds are not comparable
  if (oldData.kind !== newData.kind) {
    return {
      status: 'not_comparable',
      diffs: [],
      structuralChanges: [{ type: 'entity_added', key: 'kind_change', details: `Data kind changed: ${oldData.kind} → ${newData.kind}` }],
      previousDataVersion,
      newDataVersion,
      previousStatus,
      newStatus,
    }
  }
  
  // Extract dimension-metric pairs
  const oldPoints = extractDataPoints(oldData)
  const newPoints = extractDataPoints(newData)
  
  // Create lookup maps
  const oldMap = new Map<string, number | null>()
  for (const point of oldPoints) {
    oldMap.set(`${point.dimensionKey}:${point.metricId}`, point.value)
  }
  
  const newMap = new Map<string, number | null>()
  for (const point of newPoints) {
    newMap.set(`${point.dimensionKey}:${point.metricId}`, point.value)
  }
  
  // Compute diffs
  const diffs: DiffEntry[] = []
  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()])
  
  for (const key of allKeys) {
    const lastColonIndex = key.lastIndexOf(':')
    const dimensionKey = lastColonIndex > 0 ? key.substring(0, lastColonIndex) : key
    const metricId = lastColonIndex > 0 ? key.substring(lastColonIndex + 1) : ''
    const oldVal = oldMap.get(key) ?? null
    const newVal = newMap.get(key) ?? null
    
    // Skip if both are null
    if (oldVal === null && newVal === null) continue
    
    const absoluteChange = computeAbsoluteChange(oldVal, newVal)
    const relativeChange = computeRelativeChange(oldVal, newVal)
    const threshold = getThreshold(metricId)
    
    let thresholdMet = false
    let thresholdReason = 'no threshold defined'
    
    // Handle null → value or value → null as coverage changes
    if (oldVal === null || newVal === null) {
      // Coverage change - always significant
      thresholdMet = true
      thresholdReason = oldVal === null ? 'coverage increased (null → value)' : 'coverage decreased (value → null)'
    } else if (threshold) {
      const result = checkThreshold(absoluteChange, relativeChange, threshold)
      thresholdMet = result.met
      thresholdReason = result.reason
    }
    
    // Only include if there's an actual change
    if (oldVal !== newVal) {
      diffs.push({
        dimensionKey,
        metricId,
        oldValue: oldVal,
        newValue: newVal,
        absoluteChange,
        relativeChange,
        thresholdMet,
        thresholdReason,
      })
    }
  }
  
  // Detect structural changes
  const structuralChanges = detectStructuralChanges(oldData, newData)
  
  // Determine overall status
  const hasSignificantChange = diffs.some((d) => d.thresholdMet)
  const hasAnyChange = diffs.length > 0 || structuralChanges.length > 0
  
  let status: SemanticDiff['status']
  if (!hasAnyChange) {
    status = 'unchanged'
  } else if (hasSignificantChange) {
    status = 'changed'
  } else {
    status = 'unchanged' // Changes below threshold
  }
  
  return {
    status,
    diffs,
    structuralChanges,
    previousDataVersion: previousDataVersion ?? null,
    newDataVersion: newDataVersion ?? null,
    previousStatus,
    newStatus,
  }
}

// Validate no NaN/Infinity in diff
export function validateDiff(diff: SemanticDiff): boolean {
  for (const entry of diff.diffs) {
    if (entry.absoluteChange !== null && !isFinite(entry.absoluteChange)) {
      return false
    }
    if (entry.relativeChange !== null && !isFinite(entry.relativeChange)) {
      return false
    }
  }
  return true
}
