import { describe, it, expect, vi } from 'vitest'
import type { ToolResponse, ToolResult } from '@olist/contracts'
import type { ToolCallAdapter } from '../mcp/adapter.js'
import { createMockProvider, resetIdCounter } from '../mcp/mock-provider.js'
import { NativeLLMAgent } from './native-llm-agent.js'

function okResult(tool: string, data: Array<Record<string, unknown>>): ToolResult {
  return {
    ok: true,
    tool,
    data,
    columns: [],
    meta: {
      rowCount: data.length,
      grain: 'g',
      units: {},
      filters: {},
      assumptions: [],
      dataVersion: 'v-test',
    },
  }
}

function makeAdapter(handlers: Record<string, (args: Record<string, unknown>) => ToolResponse>): ToolCallAdapter & { calls: Array<{ name: string; args: Record<string, unknown> }> } {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  return {
    calls,
    async callTool(name, args) {
      calls.push({ name, args })
      const handler = handlers[name]
      if (!handler) {
        return { ok: false, tool: name, error: { code: 'INTERNAL_ERROR', message: `no handler for ${name}` } }
      }
      return handler(args)
    },
    async listTools() { return Object.keys(handlers) },
    async close() {},
  }
}

function makeDeps(adapter: ToolCallAdapter, responses: ReturnType<typeof createMockProvider> extends infer T ? any : any) {
  return {
    provider: responses,
    adapter,
    modelTimeoutMs: 25_000,
    toolTimeoutMs: 5_000,
    maxRequestLength: 2000,
    maxModelTurns: 4,
    maxToolCalls: 8,
  }
}

function signal(): AbortSignal {
  return new AbortController().signal
}

describe('NativeLLMAgent', () => {
  it('returns error for empty question', async () => {
    const adapter = makeAdapter({})
    const provider = createMockProvider({ responses: [] })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: '', requestId: 'r1', signal: signal() })
    expect(result.status).toBe('error')
    expect(result.errorCode).toBe('INVALID_INPUT')
    expect(provider.getCallCount()).toBe(0)
  })

  it('returns error for question exceeding max length', async () => {
    const adapter = makeAdapter({})
    const provider = createMockProvider({ responses: [] })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const longQ = 'a'.repeat(2001)
    const result = await agent.run({ question: longQ, requestId: 'r2', signal: signal() })
    expect(result.status).toBe('error')
    expect(result.errorCode).toBe('REQUEST_TOO_LONG')
  })

  it('Q1: single order_trends tool call produces success', async () => {
    resetIdCounter()
    const monthlyData = [
      { period: '2017-01-01', metric_value: 50000, order_count: 100 },
      { period: '2017-02-01', metric_value: 60000, order_count: 120 },
      { period: '2017-03-01', metric_value: 55000, order_count: 110 },
    ]
    const adapter = makeAdapter({
      order_trends: () => okResult('order_trends', monthlyData),
    })
    const provider = createMockProvider({
      responses: [
        {
          content: [{ type: 'tool_use', name: 'order_trends', input: { metric: 'revenue', granularity: 'month', from: '2017-01-01', to: '2017-12-31' } }],
        },
        {
          content: [{ type: 'text', text: 'Monthly revenue trend for 2017 shows consistent growth.' }],
          stop_reason: 'end_turn',
        },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'Show monthly revenue trend for 2017', requestId: 'r3', signal: signal() })

    expect(result.status).toBe('success')
    expect(result.actualMode).toBe('llm')
    expect(result.normalizedData).not.toBeNull()
    expect(result.chartOptions.length).toBeGreaterThan(0)
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].tool).toBe('order_trends')
    expect(provider.getCallCount()).toBe(2)
  })

  it('Q4: single payment_breakdown produces doughnut chart', async () => {
    resetIdCounter()
    const paymentData = [
      { group_key: 'credit_card', metric_value: 70 },
      { group_key: 'boleto', metric_value: 20 },
      { group_key: 'debit_card', metric_value: 10 },
    ]
    const adapter = makeAdapter({
      payment_breakdown: () => okResult('payment_breakdown', paymentData),
    })
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'payment_breakdown', input: { group_by: 'payment_type' } }] },
        { content: [{ type: 'text', text: 'Credit card dominates at 70%.' }], stop_reason: 'end_turn' },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'What share of payments are credit card vs boleto?', requestId: 'r4', signal: signal() })

    expect(result.status).toBe('success')
    expect(result.chartType).toBe('doughnut')
    expect(result.normalizedData?.kind).toBe('composition')
  })

  it('Q7: category_performance + review_analysis produces fan_out binding', async () => {
    resetIdCounter()
    const catData = [
      { category_english: 'Health', metric_value: 100, order_count: 50 },
      { category_english: 'Sports', metric_value: 80, order_count: 40 },
    ]
    const revData = [
      { category: 'Health', metric_value: 4.2 },
      { category: 'Sports', metric_value: 3.8 },
    ]
    const adapter = makeAdapter({
      category_performance: () => okResult('category_performance', catData),
      review_analysis: () => okResult('review_analysis', revData),
    })
    const provider = createMockProvider({
      responses: [
        {
          content: [
            { type: 'tool_use', name: 'category_performance', input: { metric: 'order_count', limit: 5, sort: 'desc' } },
          ],
        },
        {
          content: [{ type: 'tool_use', name: 'review_analysis', input: { metric: 'average_score', group_by: 'none', category: 'Health' } }],
        },
        {
          content: [{ type: 'text', text: 'Health leads with 4.2 stars.' }],
          stop_reason: 'end_turn',
        },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'Compare review scores across top categories', requestId: 'r5', signal: signal() })

    expect(result.status).toBe('success')
    expect(result.executablePlan?.intent).toBe('q7_top_categories_reviews')
    expect(result.executablePlan?.merge).not.toBeNull()
    expect(result.executablePlan?.merge?.strategy).toBe('keyed')
  })

  it('Q8: order_trends + review_analysis produces merge on month keys', async () => {
    resetIdCounter()
    const trendData = [
      { period: '2017-01-01', metric_value: 100, order_count: 10 },
      { period: '2017-02-01', metric_value: 200, order_count: 20 },
    ]
    const revData = [
      { group_key: '2017-01-01', metric_value: 4.0 },
      { group_key: '2017-02-01', metric_value: 4.5 },
    ]
    const adapter = makeAdapter({
      order_trends: () => okResult('order_trends', trendData),
      review_analysis: () => okResult('review_analysis', revData),
    })
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'order_trends', input: { metric: 'order_count', granularity: 'month', status: 'delivered' } }] },
        { content: [{ type: 'tool_use', name: 'review_analysis', input: { metric: 'average_score', group_by: 'month', status: 'delivered' } }] },
        { content: [{ type: 'text', text: 'Monthly orders and review scores.' }], stop_reason: 'end_turn' },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'Show monthly orders and average review score', requestId: 'r6', signal: signal() })

    expect(result.status).toBe('success')
    expect(result.executablePlan?.intent).toBe('q8_monthly_orders_and_reviews')
    expect(result.executablePlan?.merge?.leftKey).toBe('period')
  })

  it('Q9: delivery_performance(group_by=seller_id) + review_analysis produces scatter', async () => {
    resetIdCounter()
    const delData = [
      { group_key: 'seller_1', metric_value: 5.0 },
      { group_key: 'seller_2', metric_value: 8.0 },
    ]
    const revData = [
      { group_key: 'seller_1', metric_value: 4.5 },
      { group_key: 'seller_2', metric_value: 3.8 },
    ]
    const adapter = makeAdapter({
      delivery_performance: () => okResult('delivery_performance', delData),
      review_analysis: () => okResult('review_analysis', revData),
    })
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'delivery_performance', input: { metric: 'average_delivery_days', group_by: 'seller_id', status: 'delivered_reviewed' } }] },
        { content: [{ type: 'tool_use', name: 'review_analysis', input: { metric: 'average_score', group_by: 'seller', status: 'delivered_reviewed' } }] },
        { content: [{ type: 'text', text: 'Delivery days vs review score by seller.' }], stop_reason: 'end_turn' },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'Do sellers with faster delivery get better reviews?', requestId: 'r7', signal: signal() })

    expect(result.status).toBe('success')
    expect(result.executablePlan?.intent).toBe('q9_seller_delivery_vs_reviews')
    expect(result.chartType).toBe('scatter')
  })

  it('Q10: delivery_performance(group_by=state) + review_analysis produces bar chart', async () => {
    resetIdCounter()
    const delData = [
      { group_key: 'SP', metric_value: 5.0 },
      { group_key: 'RJ', metric_value: 7.0 },
    ]
    const revData = [
      { group_key: 'SP', metric_value: 4.3 },
      { group_key: 'RJ', metric_value: 4.0 },
    ]
    const adapter = makeAdapter({
      delivery_performance: () => okResult('delivery_performance', delData),
      review_analysis: () => okResult('review_analysis', revData),
    })
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'delivery_performance', input: { metric: 'average_delay_days', group_by: 'state', status: 'delivered_reviewed' } }] },
        { content: [{ type: 'tool_use', name: 'review_analysis', input: { metric: 'average_score', group_by: 'state', status: 'delivered_reviewed' } }] },
        { content: [{ type: 'text', text: 'Delivery delay and review score by state.' }], stop_reason: 'end_turn' },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'Show delivery delay and review score by state', requestId: 'r8', signal: signal() })

    expect(result.status).toBe('success')
    expect(result.executablePlan?.intent).toBe('q10_delay_and_reviews_by_state')
  })

  it('handles tool error from MCP adapter', async () => {
    resetIdCounter()
    const adapter = makeAdapter({
      order_trends: () => ({ ok: false, tool: 'order_trends', error: { code: 'DB_ERROR', message: 'Connection failed' } }),
    })
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'order_trends', input: {} }] },
        { content: [{ type: 'text', text: 'Tool failed.' }], stop_reason: 'end_turn' },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'Monthly revenue', requestId: 'r9', signal: signal() })

    expect(result.status).toBe('error')
    expect(result.sources[0].status).toBe('failed')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('rejects unknown tool names', async () => {
    resetIdCounter()
    const adapter = makeAdapter({})
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'nonexistent_tool', input: {} }] },
        { content: [{ type: 'text', text: 'Unknown tool rejected.' }], stop_reason: 'end_turn' },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'test', requestId: 'r10', signal: signal() })

    // Unknown tool gets rejected (added to toolResults as is_error but not to traces)
    // Model then returns text, buildResultFromTraces gets empty traces → emptyResult with finalText
    expect(result.status).toBe('success')
    expect(result.message).toContain('Unknown tool rejected')
  })

  it('throws provider errors to ResilientAgent', async () => {
    resetIdCounter()
    const adapter = makeAdapter({})
    const provider = createMockProvider({
      responses: [{ throw: true, message: 'PROVIDER_AUTH_FAILURE: bad key' }],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))

    await expect(
      agent.run({ question: 'test', requestId: 'r11', signal: signal() }),
    ).rejects.toThrow('PROVIDER_AUTH_FAILURE')
  })

  it('returns error result when abort signal is pre-set', async () => {
    resetIdCounter()
    const adapter = makeAdapter({})
    const provider = createMockProvider({
      responses: [{ content: [{ type: 'text', text: 'ok' }] }],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const controller = new AbortController()
    controller.abort()

    const result = await agent.run({ question: 'test', requestId: 'r12', signal: controller.signal })
    // Pre-aborted signal → loop breaks immediately → MODEL_TIMEOUT error result
    expect(result.status).toBe('error')
    expect(result.errorCode).toBe('MODEL_TIMEOUT')
  })

  it('tracks sources with correct statuses', async () => {
    resetIdCounter()
    const adapter = makeAdapter({
      order_trends: () => okResult('order_trends', [{ period: '2017-01', metric_value: 100 }]),
    })
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'order_trends', input: {} }] },
        { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'trends', requestId: 'r13', signal: signal() })

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0].tool).toBe('order_trends')
    expect(result.sources[0].status).toBe('success')
    expect(result.sources[0].rowCount).toBe(1)
    expect(result.sources[0].dataVersion).toBe('v-test')
  })

  it('validates agent result contract', async () => {
    resetIdCounter()
    const adapter = makeAdapter({
      order_trends: () => okResult('order_trends', [{ period: '2017-01', metric_value: 100 }]),
    })
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'order_trends', input: {} }] },
        { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
      ],
    })
    const agent = new NativeLLMAgent(makeDeps(adapter, provider))
    const result = await agent.run({ question: 'trends', requestId: 'r14', signal: signal() })

    // Validate contract fields
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('originalQuestion')
    expect(result).toHaveProperty('actualMode')
    expect(result).toHaveProperty('resolvedFilters')
    expect(result).toHaveProperty('assumptions')
    expect(result).toHaveProperty('normalizedData')
    expect(result).toHaveProperty('chartOptions')
    expect(result).toHaveProperty('chartType')
    expect(result).toHaveProperty('chartReason')
    expect(result).toHaveProperty('insight')
    expect(result).toHaveProperty('warnings')
    expect(result).toHaveProperty('sources')
    expect(result).toHaveProperty('dataVersion')
    expect(result).toHaveProperty('executablePlan')
    expect(result).toHaveProperty('message')
  })
})
