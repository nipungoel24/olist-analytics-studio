import type { InsightEvidence, NormalizedData } from '@olist/contracts'

// Deterministic factual insights (Architecture.md §6, Phases.md Phase 3.6).
// Every numeric claim comes only from normalized MCP output. No causality,
// no significance claims, no external explanation.

export interface InsightResult {
  text: string | null
  evidence: InsightEvidence[]
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthLabel(period: string): string {
  const match = period.match(/^(\d{4})-(\d{2})/)
  if (match) {
    const year = match[1]
    const month = Number(match[2])
    if (month >= 1 && month <= 12) {
      return `${MONTH_NAMES[month - 1]} ${year}`
    }
  }
  return period.slice(0, 10)
}

export function formatBRL(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function round2(v: number): number {
  return Number(v.toFixed(2))
}

function round1(v: number): number {
  return Number(v.toFixed(1))
}

function humanizePartLabel(key: string): string {
  switch (key) {
    case 'credit_card':
      return 'Credit cards'
    case 'boleto':
      return 'Boleto'
    case 'debit_card':
      return 'Debit cards'
    case 'voucher':
      return 'Vouchers'
    case 'other':
      return 'Other methods'
    default:
      return key
  }
}

function bestIndex(values: Array<number | null>): number | null {
  let best: number | null = null
  let bestValue = Number.NEGATIVE_INFINITY
  values.forEach((v, i) => {
    if (typeof v === 'number' && v > bestValue) {
      bestValue = v
      best = i
    }
  })
  return best
}

function worstIndex(values: Array<number | null>): number | null {
  let worst: number | null = null
  let worstValue = Number.POSITIVE_INFINITY
  values.forEach((v, i) => {
    if (typeof v === 'number' && v < worstValue) {
      worstValue = v
      worst = i
    }
  })
  return worst
}

export function buildInsight(data: NormalizedData, intentId: string): InsightResult {
  switch (intentId) {
    case 'q1_monthly_revenue_trend': {
      if (data.kind !== 'time_series') return { text: null, evidence: [] }
      const values = data.series[0]?.values ?? []
      const i = bestIndex(values)
      if (i === null) return { text: null, evidence: [] }
      const value = values[i] as number
      const text = `Revenue was highest in ${monthLabel(data.periods[i]!)} at R$${formatBRL(value)}.`
      const evidence: InsightEvidence[] = [
        { operation: 'max', key: data.periods[i]!, metric: 'revenue', value: round2(value), rowsUsed: data.periods.length },
      ]
      return { text, evidence }
    }
    case 'q2_top_revenue_categories': {
      if (data.kind !== 'ranking') return { text: null, evidence: [] }
      const i = bestIndex(data.entities.map((e) => e.metricValue))
      if (i === null) return { text: null, evidence: [] }
      const entity = data.entities[i]!
      const text = `${entity.label} generated the highest revenue at R$${formatBRL(entity.metricValue as number)} (among the displayed categories).`
      const evidence: InsightEvidence[] = [
        { operation: 'max', key: entity.key, metric: 'revenue', value: round2(entity.metricValue as number), rowsUsed: data.entities.length },
      ]
      return { text, evidence }
    }
    case 'q3_worst_delivery_states': {
      if (data.kind !== 'ranking') return { text: null, evidence: [] }
      const i = worstIndex(data.entities.map((e) => e.metricValue))
      if (i === null) return { text: null, evidence: [] }
      const entity = data.entities[i]!
      const text = `${entity.label} had the lowest on-time rate at ${formatPct(entity.metricValue as number)}.`
      const evidence: InsightEvidence[] = [
        { operation: 'min', key: entity.key, metric: 'on_time_rate', value: round2(entity.metricValue as number), rowsUsed: data.entities.length },
      ]
      return { text, evidence }
    }
    case 'q4_payment_share': {
      if (data.kind !== 'composition') return { text: null, evidence: [] }
      let best = data.parts[0]
      for (const part of data.parts) {
        if (part.value > (best?.value ?? -1)) best = part
      }
      if (!best || data.total <= 0) return { text: null, evidence: [] }
      const share = best.value / data.total
      const text = `${humanizePartLabel(best.key)} accounted for ${formatPct(share)} of payment value.`
      const evidence: InsightEvidence[] = [
        { operation: 'share', key: best.key, metric: 'payment_value', value: round2(share), rowsUsed: data.parts.length },
      ]
      return { text, evidence }
    }
    case 'q5_top_sellers_sp': {
      if (data.kind !== 'ranking') return { text: null, evidence: [] }
      const i = bestIndex(data.entities.map((e) => e.metricValue))
      if (i === null) return { text: null, evidence: [] }
      const entity = data.entities[i]!
      const text = `Seller ${entity.key.slice(0, 8)} generated the highest revenue in São Paulo at R$${formatBRL(entity.metricValue as number)}.`
      const evidence: InsightEvidence[] = [
        { operation: 'max', key: entity.key, metric: 'revenue', value: round2(entity.metricValue as number), rowsUsed: data.entities.length },
      ]
      return { text, evidence }
    }
    case 'q6_electronics_review_distribution': {
      if (data.kind !== 'distribution') return { text: null, evidence: [] }
      let best = data.buckets[0]
      for (const bucket of data.buckets) {
        if (bucket.count > (best?.count ?? -1)) best = bucket
      }
      if (!best || data.total <= 0) return { text: null, evidence: [] }
      const score = best.label.split(' ')[0]
      const text = `${score}-star reviews were the most common, with ${best.count.toLocaleString('en-US')} reviews.`
      const evidence: InsightEvidence[] = [
        { operation: 'count', key: best.label, metric: 'review_count', value: best.count, rowsUsed: data.buckets.length },
      ]
      return { text, evidence }
    }
    case 'q7_top_categories_reviews': {
      if (data.kind !== 'ranking') return { text: null, evidence: [] }
      const i = bestIndex(data.entities.map((e) => e.metricValue))
      if (i === null) return { text: null, evidence: [] }
      const entity = data.entities[i]!
      const text = `${entity.label} had the highest average review score (${round2(entity.metricValue as number)} stars) among the top 5 categories by order volume.`
      const evidence: InsightEvidence[] = [
        { operation: 'max', key: entity.key, metric: 'average_review_score', value: round2(entity.metricValue as number), rowsUsed: data.entities.length },
      ]
      return { text, evidence }
    }
    case 'q8_monthly_orders_and_reviews': {
      if (data.kind !== 'time_series') return { text: null, evidence: [] }
      const orders = data.series.find((s) => s.key === 'orders')
      const scores = data.series.find((s) => s.key === 'avg_score')
      if (!orders) return { text: null, evidence: [] }
      const i = bestIndex(orders.values)
      if (i === null) return { text: null, evidence: [] }
      const orderValue = orders.values[i] as number
      const month = monthLabel(data.periods[i]!)
      const evidence: InsightEvidence[] = [
        { operation: 'peak', key: data.periods[i]!, metric: 'order_count', value: orderValue, rowsUsed: data.periods.length },
      ]
      const scoreValue = scores?.values[i]
      if (typeof scoreValue === 'number') {
        const text = `Monthly delivered orders peaked in ${month} at ${orderValue.toLocaleString('en-US')} orders, when the average review score was ${round2(scoreValue)} stars.`
        evidence.push({ operation: 'peak', key: data.periods[i]!, metric: 'average_review_score', value: round2(scoreValue), rowsUsed: data.periods.length })
        return { text, evidence }
      }
      const text = `Monthly delivered orders peaked in ${month} at ${orderValue.toLocaleString('en-US')} orders.`
      return { text, evidence }
    }
    case 'q9_seller_delivery_vs_reviews': {
      if (data.kind !== 'correlation') return { text: null, evidence: [] }
      const withBoth = data.entities.filter((e) => typeof e.x === 'number' && typeof e.y === 'number')
      if (withBoth.length < 6) {
        return {
          text: null,
          evidence: [],
        }
      }
      const half = Math.floor(withBoth.length / 2)
      const fastest = withBoth.slice(0, half)
      const slowest = withBoth.slice(half)
      const fastestAvg = fastest.reduce((s, e) => s + (e.y as number), 0) / fastest.length
      const slowestAvg = slowest.reduce((s, e) => s + (e.y as number), 0) / slowest.length
      const evidence: InsightEvidence[] = [
        { operation: 'descriptive_comparison', key: 'fastest_half', metric: 'average_review_score', value: round2(fastestAvg), rowsUsed: fastest.length },
        { operation: 'descriptive_comparison', key: 'slowest_half', metric: 'average_review_score', value: round2(slowestAvg), rowsUsed: slowest.length },
      ]
      const text =
        fastestAvg > slowestAvg
          ? `Among the displayed sellers, the faster-delivering half has a higher average review score (${round2(fastestAvg)} vs ${round2(slowestAvg)} stars); this is a descriptive comparison, not a causal finding.`
          : `Among the displayed sellers, lower delivery times do not consistently correspond to higher review scores (${round2(fastestAvg)} vs ${round2(slowestAvg)} stars for the slower half); this is a descriptive comparison, not a causal finding.`
      return { text, evidence }
    }
    case 'q10_delay_and_reviews_by_state': {
      if (data.kind !== 'correlation') return { text: null, evidence: [] }
      const i = bestIndex(data.entities.map((e) => e.x))
      if (i === null) return { text: null, evidence: [] }
      const entity = data.entities[i]!
      const delay = entity.x as number
      const evidence: InsightEvidence[] = [
        { operation: 'max', key: entity.key, metric: 'average_delay_days', value: round1(delay), rowsUsed: data.entities.length },
      ]
      if (typeof entity.y === 'number') {
        const text = `Average delivery delay was highest in ${entity.label} at ${round1(delay)} days, where the average review score was ${round2(entity.y)} stars.`
        evidence.push({ operation: 'max', key: entity.key, metric: 'average_review_score', value: round2(entity.y), rowsUsed: data.entities.length })
        return { text, evidence }
      }
      const text = `Average delivery delay was highest in ${entity.label} at ${round1(delay)} days.`
      return { text, evidence }
    }
    default:
      return { text: null, evidence: [] }
  }
}
