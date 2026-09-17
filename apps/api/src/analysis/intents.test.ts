import { describe, it, expect } from 'vitest'
import { validateExecutablePlan, assertNoExecutableContent } from '@olist/contracts'
import { matchIntent } from './intents.js'

const EXACT_QUESTIONS: Array<{ id: string; question: string }> = [
  { id: 'q1_monthly_revenue_trend', question: 'Show monthly revenue trend for 2017' },
  { id: 'q2_top_revenue_categories', question: 'Which product categories generate the most revenue?' },
  { id: 'q3_worst_delivery_states', question: 'Which states have the worst delivery performance?' },
  { id: 'q4_payment_share', question: 'What share of payments are credit card vs boleto?' },
  { id: 'q5_top_sellers_sp', question: 'Top 10 sellers by revenue in São Paulo' },
  { id: 'q6_electronics_review_distribution', question: 'Show review score distribution for electronics' },
  { id: 'q7_top_categories_reviews', question: 'Compare review scores across the top 5 categories by order volume' },
  { id: 'q8_monthly_orders_and_reviews', question: 'Show monthly orders and average review score together for 2017' },
  { id: 'q9_seller_delivery_vs_reviews', question: 'Do sellers with faster delivery get better reviews?' },
  { id: 'q10_delay_and_reviews_by_state', question: 'Show delivery delay and review score side by side by state' },
]

const PARAPHRASES: Array<{ id: string; question: string }> = [
  { id: 'q1_monthly_revenue_trend', question: 'revenue by month in 2017' },
  { id: 'q1_monthly_revenue_trend', question: 'monthly sales for 2017' },
  { id: 'q2_top_revenue_categories', question: 'best revenue categories' },
  { id: 'q3_worst_delivery_states', question: 'lowest on-time states' },
  { id: 'q4_payment_share', question: 'payment method split' },
  { id: 'q5_top_sellers_sp', question: 'highest earning SP sellers' },
  { id: 'q6_electronics_review_distribution', question: 'electronics ratings distribution' },
  { id: 'q8_monthly_orders_and_reviews', question: 'monthly orders and average review score' },
]

describe('intent templates', () => {
  it('matches all ten exact assignment questions', () => {
    for (const { id, question } of EXACT_QUESTIONS) {
      const intent = matchIntent(question)
      expect(intent?.id, `question: ${question}`).toBe(id)
    }
  })

  it('matches documented paraphrases', () => {
    for (const { id, question } of PARAPHRASES) {
      const intent = matchIntent(question)
      expect(intent?.id, `paraphrase: ${question}`).toBe(id)
    }
  })

  it('multi-tool patterns win over generic single-tool patterns', () => {
    expect(matchIntent('monthly orders and average review score')!.id).toBe('q8_monthly_orders_and_reviews')
    expect(matchIntent('delivery delay and review score by state')!.id).toBe('q10_delay_and_reviews_by_state')
    expect(matchIntent('compare review scores across the top 5 categories by order volume')!.id).toBe('q7_top_categories_reviews')
    expect(matchIntent('do sellers with faster delivery get better reviews')!.id).toBe('q9_seller_delivery_vs_reviews')
  })

  it('plans contain the required tools, filters and dependencies', () => {
    const q7 = matchIntent(EXACT_QUESTIONS.find((q) => q.id.startsWith('q7'))!.question)!.buildPlan(EXACT_QUESTIONS.find((q) => q.id.startsWith('q7'))!.question)
    expect(q7.nodes.map((n) => n.tool)).toEqual(['category_performance', 'review_analysis'])
    expect(q7.nodes[1]!.dependsOn).toContain('categoryRanking')
    expect(q7.nodes[1]!.bindings[0]).toMatchObject({
      param: 'category',
      fromNode: 'categoryRanking',
      field: 'category_english',
      mode: 'fan_out',
    })
    expect(q7.merge).toMatchObject({ strategy: 'keyed', leftKey: 'category_english', rightKey: 'category' })

    const q8 = matchIntent(EXACT_QUESTIONS.find((q) => q.id.startsWith('q8'))!.question)!.buildPlan(EXACT_QUESTIONS.find((q) => q.id.startsWith('q8'))!.question)
    expect(q8.nodes.map((n) => n.tool)).toEqual(['order_trends', 'review_analysis'])
    expect(q8.merge).toMatchObject({ leftKey: 'period', rightKey: 'group_key' })
    expect(q8.nodes.every((n) => (n.params as { status?: string }).status === 'delivered')).toBe(true)

    const q5 = matchIntent(EXACT_QUESTIONS.find((q) => q.id.startsWith('q5'))!.question)!.buildPlan(EXACT_QUESTIONS.find((q) => q.id.startsWith('q5'))!.question)
    expect(q5.nodes[0]!.params).toMatchObject({ metric: 'revenue', state: 'SP', limit: 10, sort: 'desc' })

    const q1 = matchIntent(EXACT_QUESTIONS.find((q) => q.id.startsWith('q1'))!.question)!.buildPlan(EXACT_QUESTIONS.find((q) => q.id.startsWith('q1'))!.question)
    expect(q1.nodes[0]!.params).toMatchObject({ granularity: 'month', metric: 'revenue', from: '2017-01-01', to: '2017-12-31' })
  })

  it('all ten plans pass the executable-plan schema and contain no executable content', () => {
    for (const { question } of EXACT_QUESTIONS) {
      const intent = matchIntent(question)!
      const plan = intent.buildPlan(question)
      expect(validateExecutablePlan(plan)).toEqual(plan)
      expect(assertNoExecutableContent(plan)).toBe(true)
    }
  })
})

describe('unsupported queries', () => {
  it('returns no intent for out-of-domain questions', () => {
    expect(matchIntent('stock price of Olist')).toBeNull()
    expect(matchIntent('customer ages in São Paulo')).toBeNull()
    expect(matchIntent('What is the weather forecast?')).toBeNull()
  })
})
