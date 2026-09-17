import type { ExecutablePlan, PlanNode } from '@olist/contracts'
import { PLAN_VERSION } from '@olist/contracts'
import {
  normalized,
  resolveDateRange,
  resolveSaoPaulo,
  resolveTopN,
  resolveWorst,
  resolveElectronics,
} from './normalizer.js'

// Fallback intent templates (Phases.md Phase 3.3, PRD.md §8).
// Matchers are evaluated in declaration order: specific multi-tool patterns
// take precedence over generic single-tool patterns.

export interface Intent {
  id: string
  canonicalQuestion: string
  match: (normQuestion: string) => boolean
  buildPlan: (question: string) => ExecutablePlan
}

function node(nodeId: string, tool: string, params: Record<string, unknown>, deps: string[] = [], bindings: PlanNode['bindings'] = []): PlanNode {
  return { nodeId, tool, params, bindings, dependsOn: deps }
}

function basePlan(intent: string, question: string, nodes: PlanNode[], extra: {
  filters: Record<string, unknown>
  assumptions: string[]
  cohort: string
  merge: ExecutablePlan['merge']
  chart: ExecutablePlan['chart']
}): ExecutablePlan {
  return {
    planVersion: PLAN_VERSION,
    intent,
    question,
    filters: extra.filters,
    assumptions: extra.assumptions,
    cohort: extra.cohort,
    nodes,
    merge: extra.merge,
    chart: extra.chart,
  }
}

const Q1: Intent = {
  id: 'q1_monthly_revenue_trend',
  canonicalQuestion: 'Show monthly revenue trend for 2017',
  match: (q) => /\bmonth(ly)?\b/.test(q) && /\b(revenue|sales|trend)\b/.test(q) && !/\breview\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const nodes = [
      node('monthlyRevenue', 'order_trends', {
        granularity: 'month',
        metric: 'revenue',
        from: date.values.from,
        to: date.values.to,
      }),
    ]
    return basePlan(Q1.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, granularity: 'month', metric: 'revenue' },
      assumptions: [...date.assumptions, 'Revenue = SUM(item.price) on delivered orders, excluding freight'],
      cohort: 'delivered',
      merge: null,
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations (normal policy for a single metric over time is line).',
        description: 'Monthly delivered merchandise revenue in BRL',
      },
    })
  },
}

const Q2: Intent = {
  id: 'q2_top_revenue_categories',
  canonicalQuestion: 'Which product categories generate the most revenue?',
  match: (q) => /\bcategor/.test(q) && /\brevenue\b/.test(q) && /\b(most|top|highest|best|generate|rank)\b/.test(q) && !/\breview\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const top = resolveTopN(question)
    const limit = typeof top.values.limit === 'number' ? top.values.limit : 10
    const nodes = [
      node('categoryRanking', 'category_performance', {
        metric: 'revenue',
        limit,
        sort: 'desc',
        from: date.values.from,
        to: date.values.to,
      }),
    ]
    const assumptions = [
      ...date.assumptions,
      ...top.assumptions,
      `Display limited to the top ${limit} categories`,
      'Revenue = SUM(item.price) on delivered orders, excluding freight',
    ]
    return basePlan(Q2.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, metric: 'revenue', limit, sort: 'desc' },
      assumptions,
      cohort: 'delivered',
      merge: null,
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations (normal policy for a ranked list is a horizontal bar).',
        description: 'Product categories ranked by delivered merchandise revenue in BRL',
      },
    })
  },
}

const Q3: Intent = {
  id: 'q3_worst_delivery_states',
  canonicalQuestion: 'Which states have the worst delivery performance?',
  match: (q) => /\bstates?\b/.test(q) && /\b(delivery|deliveries|on.?time|late|delay)\b/.test(q) && /\b(worst|lowest|poorest|poor|bad|slowest)\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const worst = resolveWorst(question)
    const nodes = [
      node('deliveryByState', 'delivery_performance', {
        metric: 'on_time_rate',
        group_by: 'state',
        limit: 10,
        sort: typeof worst.values.sort === 'string' ? worst.values.sort : 'asc',
        from: date.values.from,
        to: date.values.to,
      }),
    ]
    return basePlan(Q3.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, metric: 'on_time_rate', group_by: 'state', limit: 10, sort: 'asc' },
      assumptions: [
        ...date.assumptions,
        ...worst.assumptions,
        'Delivery performance measured as on-time rate (actual <= estimated); ascending order shows the worst-performing states first',
        'Showing the 10 worst-performing states',
      ],
      cohort: 'delivered with valid delivery and estimated timestamps',
      merge: null,
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations.',
        description: 'Worst-performing states by on-time rate, worst first',
      },
    })
  },
}

const Q4: Intent = {
  id: 'q4_payment_share',
  canonicalQuestion: 'What share of payments are credit card vs boleto?',
  match: (q) => /\bpayment/.test(q) && /\b(credit|boleto|method|split|share|mix)\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const nodes = [
      node('paymentBreakdown', 'payment_breakdown', {
        metric: 'payment_value',
        group_by: 'payment_type',
        from: date.values.from,
        to: date.values.to,
      }),
    ]
    return basePlan(Q4.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, metric: 'payment_value', group_by: 'payment_type' },
      assumptions: [
        ...date.assumptions,
        'Share is computed over ALL payment methods (credit card, boleto and Other), using overall payment-value denominator',
        'Mixed payment orders can contribute to multiple payment types',
      ],
      cohort: 'delivered',
      merge: null,
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations (normal policy for part-to-whole is doughnut).',
        description: 'Share of payment value by payment method (credit card, boleto, Other)',
      },
    })
  },
}

const Q5: Intent = {
  id: 'q5_top_sellers_sp',
  canonicalQuestion: 'Top 10 sellers by revenue in São Paulo',
  match: (q) => /\bseller/.test(q) && /(sao paulo|\bsp\b)/.test(q) && /\b(top|highest|earning|revenue|best)\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const sp = resolveSaoPaulo(question, 'seller')
    const top = resolveTopN(question)
    const limit = typeof top.values.limit === 'number' ? top.values.limit : 10
    const nodes = [
      node('topSellers', 'seller_performance', {
        metric: 'revenue',
        state: sp.values.state,
        limit,
        sort: 'desc',
        from: date.values.from,
        to: date.values.to,
      }),
    ]
    return basePlan(Q5.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, metric: 'revenue', state: sp.values.state ?? null, limit, sort: 'desc' },
      assumptions: [
        ...date.assumptions,
        ...top.assumptions,
        ...sp.assumptions,
        'State filter applies to seller location (seller_state), not the destination state',
      ],
      cohort: 'delivered',
      merge: null,
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations (normal policy for a ranked list is a horizontal bar).',
        description: `Top ${limit} São Paulo sellers by delivered merchandise revenue in BRL`,
      },
    })
  },
}

const Q6: Intent = {
  id: 'q6_electronics_review_distribution',
  canonicalQuestion: 'Show review score distribution for electronics',
  match: (q) => /\b(electronics|eletronicos)\b/.test(q) && /\b(review|rating)/.test(q) && /\b(distribution|score|breakdown)\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const electronics = resolveElectronics(question)
    const nodes = [
      node('scoreDistribution', 'review_analysis', {
        metric: 'score_distribution',
        category: electronics.values.category,
        from: date.values.from,
        to: date.values.to,
      }),
    ]
    return basePlan(Q6.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, metric: 'score_distribution', category: electronics.values.category ?? null },
      assumptions: [
        ...date.assumptions,
        ...electronics.assumptions,
        'Review scores are canonical (one per order, deduplicated by latest answer timestamp)',
      ],
      cohort: 'reviewed orders (all statuses)',
      merge: null,
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations (normal policy for 1-5 score distribution is a stacked horizontal bar).',
        description: 'Review score distribution (1-5) for electronics',
      },
    })
  },
}

const Q7: Intent = {
  id: 'q7_top_categories_reviews',
  canonicalQuestion: 'Compare review scores across the top 5 categories by order volume',
  match: (q) => /\btop\b/.test(q) && /\bcategor/.test(q) && /\border/.test(q) && /\breview\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const nodes = [
      node('categoryRanking', 'category_performance', {
        metric: 'order_count',
        limit: 5,
        sort: 'desc',
        from: date.values.from,
        to: date.values.to,
      }),
      node(
        'categoryReviews',
        'review_analysis',
        { metric: 'average_score', from: date.values.from, to: date.values.to },
        ['categoryRanking'],
        [{ param: 'category', fromNode: 'categoryRanking', field: 'category_english', mode: 'fan_out' }]
      ),
    ]
    return basePlan(Q7.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, topCategories: 5 },
      assumptions: [
        ...date.assumptions,
        'Step 1 ranks categories by order volume (top 5). Step 2 queries review scores only for those dynamically selected categories',
        'Review scores are canonical (one per order, deduplicated by latest answer timestamp)',
      ],
      cohort: 'orders ranked by volume; reviews over all statuses for the selected categories',
      merge: {
        strategy: 'keyed',
        leftNode: 'categoryRanking',
        rightNode: 'categoryReviews',
        leftKey: 'category_english',
        rightKey: 'category',
        on: 'category identity',
      },
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations.',
        description: 'Average review score across the top 5 categories by order volume',
      },
    })
  },
}

const Q8: Intent = {
  id: 'q8_monthly_orders_and_reviews',
  canonicalQuestion: 'Show monthly orders and average review score together for 2017',
  match: (q) => /\bmonth(ly)?\b/.test(q) && /\b(review|score)\b/.test(q) && /\borders?\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const nodes = [
      node('monthlyOrders', 'order_trends', {
        granularity: 'month',
        metric: 'order_count',
        status: 'delivered',
        from: date.values.from,
        to: date.values.to,
      }),
      node('monthlyScores', 'review_analysis', {
        metric: 'average_score',
        group_by: 'month',
        status: 'delivered',
        from: date.values.from,
        to: date.values.to,
      }),
    ]
    return basePlan(Q8.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, granularity: 'month' },
      assumptions: [
        ...date.assumptions,
        'Both tools use the same delivered-order cohort so orders and review scores share one comparable month axis',
        'Review scores are canonical (one per order, deduplicated by latest answer timestamp)',
      ],
      cohort: 'delivered',
      merge: {
        strategy: 'keyed',
        leftNode: 'monthlyOrders',
        rightNode: 'monthlyScores',
        leftKey: 'period',
        rightKey: 'group_key',
        on: 'month-start timestamp',
        expectedCohort: 'delivered',
      },
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations. Orders (count) and review score (stars) use separate bar panels with separate scales; they are never combined on one shared axis.',
        panels: [
          { seriesKey: 'orders', label: 'Monthly delivered orders', unit: 'count' },
          { seriesKey: 'avg_score', label: 'Average review score', unit: 'stars' },
        ],
      },
    })
  },
}

const Q9: Intent = {
  id: 'q9_seller_delivery_vs_reviews',
  canonicalQuestion: 'Do sellers with faster delivery get better reviews?',
  match: (q) => /\bsellers?\b/.test(q) && /\b(delivery|deliver|faster|speed)\b/.test(q) && /\breviews?\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const nodes = [
      node('sellerDelivery', 'delivery_performance', {
        metric: 'average_delivery_days',
        group_by: 'seller_id',
        limit: 10,
        sort: 'asc',
        from: date.values.from,
        to: date.values.to,
        cohort: 'delivered_reviewed_valid_delivery',
      }),
      node('sellerScores', 'review_analysis', {
        metric: 'average_score',
        group_by: 'seller',
        from: date.values.from,
        to: date.values.to,
        cohort: 'delivered_reviewed_valid_delivery',
      }),
    ]
    return basePlan(Q9.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, sellers: '10 fastest' },
      assumptions: [
        ...date.assumptions,
        'Matching cohort: delivered orders with valid delivery timestamps, reviewed via canonical reviews',
        'Fallback shows a limited descriptive comparison of the 10 fastest-delivering sellers; it does NOT test correlation or causality',
      ],
      cohort: 'delivered_reviewed_valid_delivery',
      merge: {
        strategy: 'keyed',
        leftNode: 'sellerDelivery',
        rightNode: 'sellerScores',
        leftKey: 'group_key',
        rightKey: 'group_key',
        on: 'seller_id',
        expectedCohort: 'delivered_reviewed_valid_delivery',
      },
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations. This is a clearly labeled limited bar comparison, not a scatter correlation analysis.',
        panels: [
          { seriesKey: 'avg_delivery_days', label: 'Average delivery days (10 fastest sellers)', unit: 'days' },
          { seriesKey: 'avg_score', label: 'Average review score (same sellers)', unit: 'stars' },
        ],
        description: 'Limited descriptive comparison only; no correlation or causal claim',
      },
    })
  },
}

const Q10: Intent = {
  id: 'q10_delay_and_reviews_by_state',
  canonicalQuestion: 'Show delivery delay and review score side by side by state',
  match: (q) => /\bdelay\b/.test(q) && /\breview\b/.test(q) && /\bstate\b/.test(q),
  buildPlan: (question) => {
    const date = resolveDateRange(question)
    const nodes = [
      node('delayByState', 'delivery_performance', {
        metric: 'average_delay_days',
        group_by: 'state',
        limit: 27,
        sort: 'asc',
        from: date.values.from,
        to: date.values.to,
        cohort: 'delivered_reviewed_valid_delivery',
      }),
      node('scoresByState', 'review_analysis', {
        metric: 'average_score',
        group_by: 'state',
        from: date.values.from,
        to: date.values.to,
        cohort: 'delivered_reviewed_valid_delivery',
      }),
    ]
    return basePlan(Q10.id, question, nodes, {
      filters: { from: date.values.from ?? null, to: date.values.to ?? null, group_by: 'state' },
      assumptions: [
        ...date.assumptions,
        'State means the customer (destination) state in both tools',
        'Matching cohort: delivered orders for both delay and review score',
        'Review scores are canonical (one per order, deduplicated by latest answer timestamp)',
      ],
      cohort: 'delivered_reviewed_valid_delivery',
      merge: {
        strategy: 'keyed',
        leftNode: 'delayByState',
        rightNode: 'scoresByState',
        leftKey: 'group_key',
        rightKey: 'group_key',
        on: 'customer/destination state UF',
        expectedCohort: 'delivered_reviewed_valid_delivery',
      },
      chart: {
        chartType: 'bar',
        chartReason: 'Fallback mode is intentionally limited to bar visualizations. Delay (days) and review score (stars) use separate bar panels with separate scales.',
        panels: [
          { seriesKey: 'avg_delay_days', label: 'Average delivery delay by state', unit: 'days' },
          { seriesKey: 'avg_score', label: 'Average review score by state', unit: 'stars' },
        ],
      },
    })
  },
}

// Precedence: multi-tool patterns before generic single-tool patterns.
export const INTENTS: Intent[] = [Q8, Q10, Q7, Q9, Q5, Q6, Q1, Q4, Q3, Q2]

export function matchIntent(question: string): Intent | null {
  const q = normalized(question)
  for (const intent of INTENTS) {
    if (intent.match(q)) {
      return intent
    }
  }
  return null
}
