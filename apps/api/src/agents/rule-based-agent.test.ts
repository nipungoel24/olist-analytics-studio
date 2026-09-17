import { describe, it, expect, vi } from 'vitest'
import type { ToolResponse, ToolResult } from '@olist/contracts'
import { validateAgentResult } from '@olist/contracts'
import { RuleBasedAgent } from './rule-based-agent.js'
import type { ILLMAgent } from './interface.js'
import { createAgent } from './factory.js'
import type { ToolCallAdapter } from '../mcp/adapter.js'

function toolResult(tool: string, rows: Array<Record<string, unknown>>, extra?: Partial<ToolResult['meta']>): ToolResult {
  return {
    ok: true,
    tool,
    data: rows,
    columns: [],
    meta: {
      rowCount: rows.length,
      grain: 'g',
      units: {},
      filters: {},
      assumptions: [],
      dataVersion: 'v-test',
      ...extra,
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
        return { ok: false, tool: name, error: { code: 'INTERNAL_ERROR', message: 'no handler' } }
      }
      return handler(args)
    },
    async listTools() {
      return Object.keys(handlers)
    },
    async close() {},
  }
}

function deps(adapter: ToolCallAdapter) {
  return {
    adapter,
    fallbackTimeoutMs: 10_000,
    toolTimeoutMs: 5000,
    maxRequestLength: 2000,
  }
}

const revenueMonths = toolResult('order_trends', [
  { period: '2017-01-01T00:00:00.000Z', value: 100, denominator: 10 },
  { period: '2017-02-01T00:00:00.000Z', value: 200, denominator: 20 },
])

describe('RuleBasedAgent (ILLMAgent contract)', () => {
  it('implements ILLMAgent with mode fallback', () => {
    const agent: ILLMAgent = new RuleBasedAgent(deps(makeAdapter({})))
    expect(agent.mode).toBe('fallback')
  })

  it('runs Q1 end-to-end against a mock adapter and returns a validated success result', async () => {
    const adapter = makeAdapter({
      order_trends: () => revenueMonths,
    })
    const agent = new RuleBasedAgent(deps(adapter))
    const result = await agent.run({
      question: 'Show monthly revenue trend for 2017',
      requestId: 'req-1',
      signal: new AbortController().signal,
    })
    expect(result.status).toBe('success')
    expect(result.actualMode).toBe('fallback')
    expect(result.normalizedData?.kind).toBe('time_series')
    expect(result.chartType).toBe('bar')
    expect(result.chartOptions.every((c) => c.type === 'bar')).toBe(true)
    expect(result.insight).toBeTruthy()
    expect(result.dataVersion).toBe('v-test')
    expect(result.executablePlan?.intent).toBe('q1_monthly_revenue_trend')
    expect(adapter.calls[0]!.args).toMatchObject({ metric: 'revenue', granularity: 'month', from: '2017-01-01' })
    expect(validateAgentResult(result)).toEqual(result)
  })

  it('returns unsupported for out-of-domain questions without calling any tool', async () => {
    const adapter = makeAdapter({})
    const agent = new RuleBasedAgent(deps(adapter))
    const result = await agent.run({
      question: 'What is the stock price of Olist?',
      requestId: 'req-2',
      signal: new AbortController().signal,
    })
    expect(result.status).toBe('unsupported')
    expect(result.chartType).toBeNull()
    expect(result.chartOptions).toEqual([])
    expect(result.message).toContain('stock')
    expect(adapter.calls).toHaveLength(0)
  })

  it('returns empty for a valid filter with no data and no chart', async () => {
    const adapter = makeAdapter({
      category_performance: () => ({
        ok: false,
        tool: 'category_performance',
        error: { code: 'EMPTY_RESULT', message: 'No matching categories were found for the supplied filters.' },
      }),
    })
    const agent = new RuleBasedAgent(deps(adapter))
    const result = await agent.run({
      question: 'Which product categories generate the most revenue?',
      requestId: 'req-3',
      signal: new AbortController().signal,
    })
    expect(result.status).toBe('empty')
    expect(result.chartType).toBeNull()
    expect(result.chartOptions).toEqual([])
  })

  it('returns error when all sources fail', async () => {
    const adapter = makeAdapter({
      order_trends: () => ({
        ok: false,
        tool: 'order_trends',
        error: { code: 'DATABASE_ERROR', message: 'Database query failed: boom' },
      }),
    })
    const agent = new RuleBasedAgent(deps(adapter))
    const result = await agent.run({
      question: 'Show monthly revenue trend for 2017',
      requestId: 'req-4',
      signal: new AbortController().signal,
    })
    expect(result.status).toBe('error')
    expect(result.chartOptions).toEqual([])
    expect(result.errorCode).toBe('DATABASE_ERROR')
  })

  it('returns partial when one multi-tool source fails: successful source retained, failed source identified, chart null', async () => {
    const adapter = makeAdapter({
      order_trends: () => revenueMonths,
      review_analysis: () => ({
        ok: false,
        tool: 'review_analysis',
        error: { code: 'QUERY_TIMEOUT', message: 'Tool call exceeded its deadline' },
      }),
    })
    const agent = new RuleBasedAgent(deps(adapter))
    const result = await agent.run({
      question: 'Show monthly orders and average review score together for 2017',
      requestId: 'req-5',
      signal: new AbortController().signal,
    })
    expect(result.status).toBe('partial')
    expect(result.warnings.some((w) => w.includes('monthlyScores'))).toBe(true)
    expect(result.normalizedData).not.toBeNull()
    expect(result.chartType).toBeNull()
    expect(result.chartOptions).toEqual([])
    expect(result.sources.find((s) => s.status === 'failed')).toBeTruthy()
  })

  it('rejects over-length questions as errors without MCP calls', async () => {
    const adapter = makeAdapter({})
    const agent = new RuleBasedAgent({
      adapter,
      fallbackTimeoutMs: 10000,
      toolTimeoutMs: 5000,
      maxRequestLength: 20,
    })
    const result = await agent.run({
      question: 'x'.repeat(50),
      requestId: 'req-6',
      signal: new AbortController().signal,
    })
    expect(result.status).toBe('error')
    expect(result.errorCode).toBe('REQUEST_TOO_LONG')
    expect(adapter.calls).toHaveLength(0)
  })

  it('does not touch provider credentials or provider SDKs (zero provider dependency)', async () => {
    const adapter = makeAdapter({ order_trends: () => revenueMonths })
    const agent = new RuleBasedAgent(deps(adapter))
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'))
    const result = await agent.run({
      question: 'Show monthly revenue trend for 2017',
      requestId: 'req-7',
      signal: new AbortController().signal,
    })
    spy.mockRestore()
    expect(result.status).toBe('success')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('agent factory', () => {
  it('creates the fallback agent for AGENT_MODE=fallback', () => {
    const agent = createAgent({
      ...deps(makeAdapter({})),
      agentMode: 'fallback',
    })
    expect(agent.mode).toBe('fallback')
  })

  it('does not fake LLM mode: missing API key triggers auto-fallback', async () => {
    const agent = createAgent({
      ...deps(makeAdapter({})),
      agentMode: 'llm',
      // No API key provided
    })
    const result = await agent.run({
      question: 'Show monthly revenue trend for 2017',
      requestId: 'req-8',
      signal: new AbortController().signal,
    })
    // Phase 4: missing key → ResilientAgent → auto-fallback to RuleBasedAgent
    // The fallback agent also fails because the adapter has no handlers,
    // but the mode is 'fallback' and the fallbackReason is set
    expect(result.actualMode).toBe('fallback')
    expect(result.fallbackReason).toBeDefined()
  })
})
