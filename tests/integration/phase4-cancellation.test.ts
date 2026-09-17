import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { AgentResult } from '@olist/contracts'
import { createAgent, NativeLLMAgent } from '@olist/api/agents'
import { createMcpAdapter, type ToolCallAdapter } from '@olist/api/mcp'
import { createMockProvider, resetIdCounter } from '@olist/api/mcp/mock-provider'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { join } from 'path'

// Phase 4 cancellation test: abort analysis while provider is in-flight.

const MCP_SERVER_PATH = join(import.meta.dirname, '..', '..', 'apps', 'mcp', 'dist', 'server.js')

let client: Client
let transport: StdioClientTransport

beforeAll(async () => {
  transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER_PATH] })
  client = new Client({ name: 'phase4-cancel-test', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
}, 30000)

afterAll(async () => {
  await client.close().catch(() => {})
  await transport.close().catch(() => {})
})

describe('Phase 4 cancellation', () => {
  it('abort signal stops provider and agent', async () => {
    resetIdCounter()

    // Script a provider with delay so abort fires during provider call
    const provider = createMockProvider({
      delayMs: 200,
      responses: [
        { content: [{ type: 'tool_use', name: 'order_trends', input: { metric: 'revenue' } }] },
        { content: [{ type: 'tool_use', name: 'category_performance', input: { metric: 'revenue' } }] },
        { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' },
      ],
    })

    const adapter: ToolCallAdapter = createMcpAdapter(client)
    const agent = new NativeLLMAgent({
      provider,
      adapter,
      modelTimeoutMs: 25_000,
      toolTimeoutMs: 5_000,
      maxRequestLength: 2000,
      maxModelTurns: 4,
      maxToolCalls: 8,
    })

    const controller = new AbortController()

    // Abort after a short delay — fires during provider delay
    setTimeout(() => controller.abort(), 50)

    let threw = false
    let result: AgentResult | null = null
    try {
      result = await agent.run({
        question: 'Show monthly revenue trend for 2017',
        requestId: 'req-cancel',
        signal: controller.signal,
      })
    } catch {
      threw = true
    }

    // Agent should either return error/partial OR throw — both indicate abort worked
    if (!threw) {
      expect(['error', 'partial']).toContain(result!.status)
    }
    // If it threw, the abort was processed (provider error propagated)
    expect(threw || result!.status !== 'success').toBe(true)
  }, 15_000)

  it('pre-aborted signal returns immediately', async () => {
    resetIdCounter()
    const provider = createMockProvider({
      responses: [{ content: [{ type: 'text', text: 'ok' }] }],
    })
    const adapter: ToolCallAdapter = createMcpAdapter(client)
    const agent = new NativeLLMAgent({
      provider,
      adapter,
      modelTimeoutMs: 25_000,
      toolTimeoutMs: 5_000,
      maxRequestLength: 2000,
      maxModelTurns: 4,
      maxToolCalls: 8,
    })

    const controller = new AbortController()
    controller.abort()

    const result = await agent.run({
      question: 'test',
      requestId: 'req-pre-cancel',
      signal: controller.signal,
    })

    // Pre-aborted → immediate error, no provider call
    expect(result.status).toBe('error')
    expect(result.errorCode).toBe('MODEL_TIMEOUT')
    expect(provider.getCallCount()).toBe(0)
  }, 5_000)
})
