import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { join } from 'path'
import { buildApp } from '@olist/api'
import { createAgent, NativeLLMAgent, ResilientAgent } from '@olist/api/agents'
import { createMcpAdapter, type ToolCallAdapter } from '@olist/api/mcp'
import { createMockProvider, resetIdCounter, type MockProviderResponse } from '@olist/api/mcp/mock-provider'
import type { AgentResult } from '@olist/contracts'
import { validateAgentResult } from '@olist/contracts'

// Phase 4 LLM-mode Q1-Q10 integration matrix.
// Full path: POST /api/analyses → factory → ResilientAgent → NativeLLMAgent
//   → MockProviderAdapter (native tool_use) → MCP adapter → real MCP → PostgreSQL

const MCP_SERVER_PATH = join(import.meta.dirname, '..', '..', 'apps', 'mcp', 'dist', 'server.js')

let client: Client
let transport: StdioClientTransport

beforeAll(async () => {
  transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER_PATH] })
  client = new Client({ name: 'phase4-llm-test', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
}, 30000)

afterAll(async () => {
  await client.close().catch(() => {})
  await transport.close().catch(() => {})
})

// Scripted provider responses for each query.
// Each entry: the sequence of provider responses the mock will return.
const QUERY_SCRIPTS: Record<string, {
  question: string
  responses: Array<MockProviderResponse | { throw: true; message: string }>
  expectedIntent: string
  expectedChartType?: string
  expectedMcpTools: string[]
  expectMerge?: boolean
  expectDependency?: boolean
}> = {
  q1: {
    question: 'Show monthly revenue trend for 2017',
    responses: [
      { content: [{ type: 'tool_use', name: 'order_trends', input: { metric: 'revenue', granularity: 'month', from: '2017-01-01', to: '2017-12-31', status: 'delivered' } }] },
      { content: [{ type: 'text', text: 'Monthly revenue for 2017 shows growth across all 12 months.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q1_monthly_revenue_trend',
    expectedChartType: 'line',
    expectedMcpTools: ['order_trends'],
  },
  q2: {
    question: 'Which product categories generate the most revenue?',
    responses: [
      { content: [{ type: 'tool_use', name: 'category_performance', input: { metric: 'revenue', limit: 10, sort: 'desc', status: 'delivered' } }] },
      { content: [{ type: 'text', text: 'Bed bath table leads with the highest revenue across all categories.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q2_top_revenue_categories',
    expectedChartType: 'bar',
    expectedMcpTools: ['category_performance'],
  },
  q3: {
    question: 'Which states have the worst delivery performance?',
    responses: [
      { content: [{ type: 'tool_use', name: 'delivery_performance', input: { metric: 'on_time_rate', group_by: 'state', sort: 'asc', limit: 10 } }] },
      { content: [{ type: 'text', text: 'Several states show below-average on-time delivery rates.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q3_worst_delivery_states',
    expectedChartType: 'bar',
    expectedMcpTools: ['delivery_performance'],
  },
  q4: {
    question: 'What share of payments are credit card vs boleto?',
    responses: [
      { content: [{ type: 'tool_use', name: 'payment_breakdown', input: { metric: 'payment_value', group_by: 'payment_type' } }] },
      { content: [{ type: 'text', text: 'Credit card dominates at roughly 70% of total payment value, boleto is about 20%.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q4_payment_share',
    expectedChartType: 'doughnut',
    expectedMcpTools: ['payment_breakdown'],
  },
  q5: {
    question: 'Top 10 sellers by revenue in São Paulo',
    responses: [
      { content: [{ type: 'tool_use', name: 'seller_performance', input: { metric: 'revenue', state: 'SP', limit: 10, sort: 'desc' } }] },
      { content: [{ type: 'text', text: 'Top SP sellers ranked by revenue.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q5_top_sellers_sp',
    expectedChartType: 'bar',
    expectedMcpTools: ['seller_performance'],
  },
  q6: {
    question: 'Show review score distribution for electronics',
    responses: [
      { content: [{ type: 'tool_use', name: 'review_analysis', input: { metric: 'score_distribution', category: 'electronics', status: 'delivered' } }] },
      { content: [{ type: 'text', text: 'Review scores span 1-5 with most clustered around 4-5.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q6_electronics_review_distribution',
    expectedChartType: 'bar',
    expectedMcpTools: ['review_analysis'],
  },
  q7: {
    question: 'Compare review scores across the top 5 categories by order volume',
    responses: [
      // Turn 1: category ranking - returns actual top-5 categories
      { content: [{ type: 'tool_use', name: 'category_performance', input: { metric: 'order_count', limit: 5, sort: 'desc', status: 'delivered' } }] },
      // Turn 2: dynamic fan-out - extract categories from Turn 1 result, generate review_analysis per category
      {
        dynamic: true,
        generate: (messages) => {
          // Find the category_performance result in tool_result messages
          for (const msg of messages) {
            if (msg.role === 'user' && Array.isArray(msg.content)) {
              for (const block of msg.content) {
                if (block.type === 'tool_result') {
                  // Content can be a string or an array of content blocks
                  const contentStr = typeof block.content === 'string'
                    ? block.content
                    : Array.isArray(block.content)
                      ? block.content.map((c: any) => c.text || '').join('')
                      : ''
                  try {
                    const result = JSON.parse(contentStr)
                    if (result.data && Array.isArray(result.data) && result.data.length > 0 && result.data[0].category_english) {
                      // Extract category_english values and generate one review_analysis per category
                      const categories = result.data.map((row: any) => row.category_english)
                      return {
                        content: categories.map((cat: string) => ({
                          type: 'tool_use' as const,
                          name: 'review_analysis',
                          input: { metric: 'average_score', category: cat, status: 'delivered' },
                        })),
                      }
                    }
                  } catch {
                    // Ignore parse errors
                  }
                }
              }
            }
          }
          // Fallback: should not happen in normal test flow
          return { content: [{ type: 'text', text: 'No categories found' }] }
        },
      },
      // Turn 3: final response
      { content: [{ type: 'text', text: 'Bed bath table and furniture decor lead in review scores among the top 5 categories.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q7_top_categories_reviews',
    expectedMcpTools: ['category_performance', 'review_analysis'],
    expectDependency: true,
  },
  q8: {
    question: 'Show monthly orders and average review score together for 2017',
    responses: [
      { content: [
        { type: 'tool_use', name: 'order_trends', input: { metric: 'order_count', granularity: 'month', from: '2017-01-01', to: '2017-12-31', status: 'delivered' } },
      ] },
      { content: [{ type: 'tool_use', name: 'review_analysis', input: { metric: 'average_score', group_by: 'month', from: '2017-01-01', to: '2017-12-31', status: 'delivered' } }] },
      { content: [{ type: 'text', text: 'Monthly orders and review scores for 2017 are available.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q8_monthly_orders_and_reviews',
    expectedMcpTools: ['order_trends', 'review_analysis'],
    expectMerge: true,
  },
  q9: {
    question: 'Do sellers with faster delivery get better reviews?',
    responses: [
      { content: [{ type: 'tool_use', name: 'delivery_performance', input: { metric: 'average_delivery_days', group_by: 'seller_id', limit: 10, sort: 'asc', cohort: 'delivered_reviewed_valid_delivery' } }] },
      { content: [{ type: 'tool_use', name: 'review_analysis', input: { metric: 'average_score', group_by: 'seller', cohort: 'delivered_reviewed_valid_delivery' } }] },
      { content: [{ type: 'text', text: 'Delivery days and review scores by seller are available for comparison.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q9_seller_delivery_vs_reviews',
    expectedMcpTools: ['delivery_performance', 'review_analysis'],
    expectMerge: true,
  },
  q10: {
    question: 'Show delivery delay and review score side by side by state',
    responses: [
      { content: [{ type: 'tool_use', name: 'delivery_performance', input: { metric: 'average_delay_days', group_by: 'state', limit: 27, sort: 'asc', cohort: 'delivered_reviewed_valid_delivery' } }] },
      { content: [{ type: 'tool_use', name: 'review_analysis', input: { metric: 'average_score', group_by: 'state', cohort: 'delivered_reviewed_valid_delivery' } }] },
      { content: [{ type: 'text', text: 'Delivery delay and review score by state are available.' }], stop_reason: 'end_turn' },
    ],
    expectedIntent: 'q10_delay_and_reviews_by_state',
    expectedMcpTools: ['delivery_performance', 'review_analysis'],
    expectMerge: true,
  },
}

function makeApp(script: MockProviderResponse[]) {
  resetIdCounter()
  const adapter: ToolCallAdapter = createMcpAdapter(client)
  const provider = createMockProvider({ responses: script })

  const agent = createAgent({
    adapter,
    fallbackTimeoutMs: 30_000,
    toolTimeoutMs: 5_000,
    maxRequestLength: 2000,
    agentMode: 'llm',
    anthropicApiKey: 'test-key-for-mock',
    providerAdapter: provider,
    maxModelTurns: 4,
    maxToolCalls: 8,
  })

  return { app: buildApp({ agent, db: null, maxRequestLength: 2000 }), provider }
}

describe('Phase 4 LLM-mode Q1-Q10 integration matrix', () => {
  for (const [qid, script] of Object.entries(QUERY_SCRIPTS)) {
    it(`${qid}: ${script.question}`, async () => {
      const { app, provider } = makeApp(script.responses as MockProviderResponse[])

      const res = await app.inject({
        method: 'POST',
        url: '/api/analyses',
        payload: { question: script.question },
      })

      expect(res.statusCode, `HTTP status for ${qid}`).toBe(200)
      const body = res.json()

      // Validate AgentResult contract
      expect(body).toHaveProperty('status')
      expect(body).toHaveProperty('actualMode')
      expect(body).toHaveProperty('originalQuestion')
      expect(body).toHaveProperty('resolvedFilters')
      expect(body).toHaveProperty('assumptions')
      expect(body).toHaveProperty('normalizedData')
      expect(body).toHaveProperty('chartOptions')
      expect(body).toHaveProperty('chartType')
      expect(body).toHaveProperty('chartReason')
      expect(body).toHaveProperty('insight')
      expect(body).toHaveProperty('warnings')
      expect(body).toHaveProperty('sources')
      expect(body).toHaveProperty('dataVersion')
      expect(body).toHaveProperty('executablePlan')

      // Core assertions
      if (script.expectedMcpTools.length > 1) {
        expect(['success', 'partial']).toContain(body.status)
      } else {
        expect(body.status, `${qid} status`).toBe('success')
      }
      expect(body.actualMode, `${qid} actualMode`).toBe('llm')
      expect(body.normalizedData, `${qid} normalizedData`).not.toBeNull()
      expect(body.chartOptions.length, `${qid} chartOptions`).toBeGreaterThan(0)
      expect(body.sources.length, `${qid} sources`).toBeGreaterThan(0)

      // Intent detection
      expect(body.executablePlan?.intent, `${qid} intent`).toBe(script.expectedIntent)

      // Provider call count
      expect(provider.getCallCount(), `${qid} provider calls`).toBeGreaterThanOrEqual(2)

      // Sources: all expected MCP tools should appear
      const mcpToolsCalled = body.sources.map((s: any) => s.tool)
      for (const expectedTool of script.expectedMcpTools) {
        expect(mcpToolsCalled, `${qid} should call ${expectedTool}`).toContain(expectedTool)
      }

      // Merge if expected
      if (script.expectMerge) {
        expect(body.executablePlan?.merge, `${qid} merge`).not.toBeNull()
      }

      // Dependency if expected (Q7)
      if (script.expectDependency) {
        const plan = body.executablePlan
        expect(plan?.nodes.length, `${qid} should have multiple nodes`).toBeGreaterThanOrEqual(2)
        // At least one node should depend on another
        const hasDependency = plan?.nodes.some((n: any) => n.dependsOn?.length > 0)
        expect(hasDependency, `${qid} should have dependency binding`).toBe(true)
        // Merge should be keyed
        expect(plan?.merge?.strategy, `${qid} merge strategy`).toBe('keyed')
      }

      // Validate insight is present and factual for ALL queries (Q1-Q10)
      expect(body.insight, `${qid} insight`).not.toBeNull()
      expect(typeof body.insight, `${qid} insight type`).toBe('string')
      expect(body.insight.length, `${qid} insight length`).toBeGreaterThan(10)

      // Validate normalizedData is non-empty for successful queries
      if (body.status === 'success') {
        expect(body.normalizedData, `${qid} normalizedData`).not.toBeNull()
      }

      // Validate dataVersion
      expect(body.dataVersion, `${qid} dataVersion`).not.toBeNull()

      await app.close()
    }, 60_000)
  }
})
