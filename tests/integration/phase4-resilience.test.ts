import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { join } from 'path'
import { buildApp } from '@olist/api'
import { createAgent } from '@olist/api/agents'
import { createMcpAdapter, type ToolCallAdapter } from '@olist/api/mcp'
import { createMockProvider, resetIdCounter } from '@olist/api/mcp/mock-provider'
import type { AgentResult } from '@olist/contracts'

// Phase 4 resilience matrix: all failure modes through the real agent factory.

const MCP_SERVER_PATH = join(import.meta.dirname, '..', '..', 'apps', 'mcp', 'dist', 'server.js')

let client: Client
let transport: StdioClientTransport

beforeAll(async () => {
  transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER_PATH] })
  client = new Client({ name: 'phase4-resilience-test', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
}, 30000)

afterAll(async () => {
  await client.close().catch(() => {})
  await transport.close().catch(() => {})
})

const QUESTION = 'Show monthly revenue trend for 2017'

function makeAdapter(): ToolCallAdapter {
  return createMcpAdapter(client)
}

function makeAppViaFactory(deps: {
  agentMode: string
  anthropicApiKey?: string | null
  providerAdapter?: any | null
}) {
  resetIdCounter()
  const adapter = makeAdapter()
  const agent = createAgent({
    adapter,
    fallbackTimeoutMs: 30_000,
    toolTimeoutMs: 5_000,
    maxRequestLength: 2000,
    agentMode: deps.agentMode,
    anthropicApiKey: deps.anthropicApiKey,
    providerAdapter: deps.providerAdapter,
    maxModelTurns: 4,
    maxToolCalls: 8,
  })
  return { app: buildApp({ agent, db: null, maxRequestLength: 2000 }), agent }
}

describe('Phase 4 resilience matrix', () => {
  it('missing ANTHROPIC_API_KEY -> auto-fallback', async () => {
    const { app } = makeAppViaFactory({
      agentMode: 'llm',
      // No API key
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: QUESTION },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('success')
    expect(body.actualMode).toBe('fallback')
    expect(body.fallbackReason).toBeDefined()
    await app.close()
  }, 60_000)

  it('provider auth failure -> fallback', async () => {
    resetIdCounter()
    const provider = createMockProvider({
      responses: [{ throw: true, message: 'PROVIDER_AUTH_FAILURE: invalid_api_key' }],
    })
    const { app } = makeAppViaFactory({
      agentMode: 'llm',
      anthropicApiKey: 'bad-key',
      providerAdapter: provider,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: QUESTION },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('success')
    expect(body.actualMode).toBe('fallback')
    expect(body.fallbackReason).toContain('missing or invalid API key')
    await app.close()
  }, 60_000)

  it('provider rate limit -> fallback', async () => {
    resetIdCounter()
    const provider = createMockProvider({
      responses: [{ throw: true, message: '429 rate_limit exceeded' }],
    })
    const { app } = makeAppViaFactory({
      agentMode: 'llm',
      anthropicApiKey: 'test-key',
      providerAdapter: provider,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: QUESTION },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('success')
    expect(body.actualMode).toBe('fallback')
    expect(body.fallbackReason).toContain('rate limit')
    await app.close()
  }, 60_000)

  it('provider 5xx -> fallback', async () => {
    resetIdCounter()
    const provider = createMockProvider({
      responses: [{ throw: true, message: '500 internal server error' }],
    })
    const { app } = makeAppViaFactory({
      agentMode: 'llm',
      anthropicApiKey: 'test-key',
      providerAdapter: provider,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: QUESTION },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('success')
    expect(body.actualMode).toBe('fallback')
    expect(body.fallbackReason).toContain('server error')
    await app.close()
  }, 60_000)

  it('provider network failure -> fallback', async () => {
    resetIdCounter()
    const provider = createMockProvider({
      responses: [{ throw: true, message: 'network fetch failed ECONNREFUSED' }],
    })
    const { app } = makeAppViaFactory({
      agentMode: 'llm',
      anthropicApiKey: 'test-key',
      providerAdapter: provider,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: QUESTION },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('success')
    expect(body.actualMode).toBe('fallback')
    expect(body.fallbackReason).toContain('network failure')
    await app.close()
  }, 60_000)

  it('provider timeout -> fallback', async () => {
    resetIdCounter()
    const provider = createMockProvider({
      responses: [{ throw: true, message: 'timeout ECONNABORTED model_timeout' }],
    })
    const { app } = makeAppViaFactory({
      agentMode: 'llm',
      anthropicApiKey: 'test-key',
      providerAdapter: provider,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: QUESTION },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('success')
    expect(body.actualMode).toBe('fallback')
    expect(body.fallbackReason).toContain('timeout')
    await app.close()
  }, 60_000)

  it('unknown hallucinated tool -> correction opportunity then fallback', async () => {
    resetIdCounter()
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'execute_sql', input: { query: 'SELECT * FROM orders' } }] },
        { content: [{ type: 'text', text: 'Here is the result.' }], stop_reason: 'end_turn' },
      ],
    })
    const { app } = makeAppViaFactory({
      agentMode: 'llm',
      anthropicApiKey: 'test-key',
      providerAdapter: provider,
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: QUESTION },
    })
    const body = res.json()
    // Unknown tool is rejected by name validation; agent completes with error/partial
    expect(body.status).toBeDefined()
    expect(body.actualMode).toBe('llm')
    // execute_sql should never have been called on MCP
    const mcpTools = body.sources?.map((s: any) => s.tool) ?? []
    expect(mcpTools).not.toContain('execute_sql')
    await app.close()
  }, 60_000)

  it('MAX_MODEL_TURNS terminates loop deterministically', async () => {
    resetIdCounter()
    // Provider always returns tool_use, never end_turn
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'order_trends', input: { metric: 'revenue' } }] },
        { content: [{ type: 'tool_use', name: 'order_trends', input: { metric: 'revenue' } }] },
        { content: [{ type: 'tool_use', name: 'order_trends', input: { metric: 'revenue' } }] },
        { content: [{ type: 'tool_use', name: 'order_trends', input: { metric: 'revenue' } }] },
        // Turn 5 would exceed maxModelTurns=4
      ],
    })
    const adapter = makeAdapter()
    const agent = createAgent({
      adapter,
      fallbackTimeoutMs: 30_000,
      toolTimeoutMs: 5_000,
      maxRequestLength: 2000,
      agentMode: 'llm',
      anthropicApiKey: 'test-key',
      providerAdapter: provider,
      maxModelTurns: 4,
      maxToolCalls: 8,
    })
    const result = await agent.run({
      question: QUESTION,
      requestId: 'req-turns',
      signal: new AbortController().signal,
    })
    // Should terminate with partial/error, not hang
    expect(['success', 'partial', 'error']).toContain(result.status)
    // Provider should have been called at most 4 times
    expect(provider.getCallCount()).toBeLessThanOrEqual(4)
  }, 60_000)

  it('MAX_TOOL_CALLS terminates loop deterministically', async () => {
    resetIdCounter()
    // Each provider response calls 2 tools, exhausting 8-tool budget in 4 responses
    const provider = createMockProvider({
      responses: [
        { content: [
          { type: 'tool_use', name: 'order_trends', input: { metric: 'revenue' } },
          { type: 'tool_use', name: 'category_performance', input: { metric: 'revenue' } },
        ] },
        { content: [
          { type: 'tool_use', name: 'seller_performance', input: { metric: 'revenue' } },
          { type: 'tool_use', name: 'review_analysis', input: { metric: 'average_score' } },
        ] },
        { content: [
          { type: 'tool_use', name: 'payment_breakdown', input: { metric: 'payment_value' } },
          { type: 'tool_use', name: 'delivery_performance', input: { metric: 'on_time_rate' } },
        ] },
        { content: [
          { type: 'tool_use', name: 'order_trends', input: { metric: 'order_count' } },
          { type: 'tool_use', name: 'category_performance', input: { metric: 'order_count' } },
        ] },
      ],
    })
    const adapter = makeAdapter()
    const agent = createAgent({
      adapter,
      fallbackTimeoutMs: 30_000,
      toolTimeoutMs: 5_000,
      maxRequestLength: 2000,
      agentMode: 'llm',
      anthropicApiKey: 'test-key',
      providerAdapter: provider,
      maxModelTurns: 10,
      maxToolCalls: 8,
    })
    const result = await agent.run({
      question: QUESTION,
      requestId: 'req-calls',
      signal: new AbortController().signal,
    })
    expect(['success', 'partial', 'error']).toContain(result.status)
    // Should not execute more than 8 MCP calls
    const totalMcpCalls = result.sources?.length ?? 0
    expect(totalMcpCalls).toBeLessThanOrEqual(8)
  }, 60_000)
})
