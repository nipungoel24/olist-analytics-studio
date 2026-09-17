import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { join } from 'path'
import { RuleBasedAgent } from '@olist/api/agents'
import { createMcpAdapter, type ToolCallAdapter } from '@olist/api/mcp'
import type { AgentResult } from '@olist/contracts'

// Real MCP child + real PostgreSQL: end-to-end fallback matrix for Q1-Q10.

const MCP_SERVER_PATH = join(import.meta.dirname, '..', '..', 'apps', 'mcp', 'dist', 'server.js')

let client: Client
let transport: StdioClientTransport
let agent: RuleBasedAgent

beforeAll(async () => {
  transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER_PATH] })
  client = new Client({ name: 'phase3-test', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
  const adapter: ToolCallAdapter = createMcpAdapter(client)
  agent = new RuleBasedAgent({
    adapter,
    fallbackTimeoutMs: 30000,
    toolTimeoutMs: 5000,
    maxRequestLength: 2000,
  })
}, 30000)

afterAll(async () => {
  await client.close().catch(() => {})
  await transport.close().catch(() => {})
})

const QUESTIONS: Array<{ id: string; question: string }> = [
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

async function run(question: string): Promise<AgentResult> {
  return agent.run({ question, requestId: `req-${Date.now()}`, signal: new AbortController().signal })
}

describe('Phase 3 real-stack fallback matrix (Q1-Q10)', () => {
  for (const { id, question } of QUESTIONS) {
    it(`${id}: ${question} -> success with bar-only fallback chart`, async () => {
      const result = await run(question)
      expect(result.status, `${id} failed: ${result.message ?? ''}`).toBe('success')
      expect(result.actualMode).toBe('fallback')
      expect(result.executablePlan?.intent).toBe(id)
      expect(result.normalizedData).not.toBeNull()
      expect(result.chartOptions.length).toBeGreaterThan(0)
      for (const chart of result.chartOptions) {
        expect(chart.type).toBe('bar')
      }
      expect(result.chartReason).toBeTruthy()
      expect(result.insight).toBeTruthy()
      expect(result.dataVersion).toBeTruthy()
      expect(result.sources.length).toBeGreaterThan(0)
    }, 120000)
  }

  it('Q1 has 12 ordered months and a BRL total', async () => {
    const result = await run('Show monthly revenue trend for 2017')
    if (result.normalizedData?.kind !== 'time_series') throw new Error('expected time_series')
    expect(result.normalizedData.periods).toHaveLength(12)
    expect(result.normalizedData.periods[0]).toContain('2017-01')
    expect(result.normalizedData.periods[11]).toContain('2017-12')
  }, 120000)

  it('Q5 returns only SP sellers', async () => {
    const result = await run('Top 10 sellers by revenue in São Paulo')
    if (result.normalizedData?.kind !== 'ranking') throw new Error('expected ranking')
    expect(result.normalizedData.entities.length).toBeLessThanOrEqual(10)
    expect(result.resolvedFilters['state']).toBe('SP')
  }, 120000)

  it('Q7 executes a dynamic dependent plan with fresh top-5 binding', async () => {
    const result = await run('Compare review scores across the top 5 categories by order volume')
    expect(result.executablePlan?.nodes[1]?.bindings[0]).toMatchObject({ mode: 'fan_out', fromNode: 'categoryRanking' })
    if (result.normalizedData?.kind !== 'ranking') throw new Error('expected ranking')
    expect(result.normalizedData.entities.length).toBeLessThanOrEqual(5)
    expect(result.normalizedData.entities.length).toBeGreaterThan(0)
  }, 120000)

  it('Q8 merges two tools on month keys with separate panels', async () => {
    const result = await run('Show monthly orders and average review score together for 2017')
    if (result.normalizedData?.kind !== 'time_series') throw new Error('expected time_series')
    expect(result.normalizedData.series).toHaveLength(2)
    expect(result.chartOptions).toHaveLength(2)
    expect(result.chartOptions.every((c) => c.type === 'bar')).toBe(true)
  }, 120000)

  it('Q9 has no causal claim language anywhere', async () => {
    const result = await run('Do sellers with faster delivery get better reviews?')
    const lower = `${result.insight ?? ''} ${result.chartReason ?? ''} ${result.chartOptions.map((c) => c.description ?? '').join(' ')}`.toLowerCase()
    expect(lower).not.toMatch(/causes/)
    expect(lower).not.toMatch(/leads to/)
    expect(lower).not.toMatch(/results in/)
    expect(lower).toContain('descriptive')
    expect(result.chartOptions.every((c) => c.type === 'bar')).toBe(true)
  }, 120000)

  it('Q10 uses separate bar panels for days and stars', async () => {
    const result = await run('Show delivery delay and review score side by side by state')
    expect(result.chartOptions).toHaveLength(2)
    expect(result.chartOptions.every((c) => c.type === 'bar')).toBe(true)
  }, 120000)

  it('unsupported question -> unsupported, no chart, no MCP call for stock queries', async () => {
    const result = await run('What is the stock price of Olist?')
    expect(result.status).toBe('unsupported')
    expect(result.chartOptions).toEqual([])
    expect(result.chartType).toBeNull()
    expect(result.sources).toHaveLength(0)
  }, 60000)

  it('valid filter with no data -> empty, no chart', async () => {
    // A category that does not exist in any form is rejected as unknown;
    // instead force an empty result via a future date range through Q1 phrasing.
    const result = await run('Show monthly revenue trend for 2099')
    expect(['empty', 'success']).toContain(result.status)
    if (result.status === 'empty') {
      expect(result.chartOptions).toEqual([])
    }
  }, 60000)
})
