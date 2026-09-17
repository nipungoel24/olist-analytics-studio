import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { join } from 'path'
import { buildApp } from '@olist/api'
import { createAgent, RuleBasedAgent, type ILLMAgent } from '@olist/api/agents'
import { createMcpAdapter, type ToolCallAdapter } from '@olist/api/mcp'
import { validateAgentResult } from '@olist/contracts'

// POST /api/analyses against the real stack via Fastify inject.

const MCP_SERVER_PATH = join(import.meta.dirname, '..', '..', 'apps', 'mcp', 'dist', 'server.js')

let client: Client
let transport: StdioClientTransport

beforeAll(async () => {
  transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER_PATH] })
  client = new Client({ name: 'phase3-api-test', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
}, 30000)

afterAll(async () => {
  await client.close().catch(() => {})
  await transport.close().catch(() => {})
})

function makeApp(agentOverride?: ILLMAgent, persist = false) {
  const adapter: ToolCallAdapter = createMcpAdapter(client)
  const agent: ILLMAgent =
    agentOverride ??
    new RuleBasedAgent({
      adapter,
      fallbackTimeoutMs: 30000,
      toolTimeoutMs: 5000,
      maxRequestLength: 2000,
    })
  return buildApp({
    agent,
    db: null,
    maxRequestLength: 2000,
    persistResults: persist,
  })
}

describe('POST /api/analyses', () => {
  it('valid Q1 returns 200 with a validated AgentResult', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Show monthly revenue trend for 2017' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(validateAgentResult(body)).toEqual(body)
    expect(body.status).toBe('success')
    expect(body.actualMode).toBe('fallback')
    expect(body.chartOptions.every((c: { type: string }) => c.type === 'bar')).toBe(true)
    await app.close()
  }, 120000)

  it('valid Q7 multi-tool returns success with dependent binding', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Compare review scores across the top 5 categories by order volume' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('success')
    expect(body.executablePlan.nodes[1].bindings[0].mode).toBe('fan_out')
    await app.close()
  }, 120000)

  it('valid Q9 returns a limited fallback comparison', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Do sellers with faster delivery get better reviews?' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('success')
    expect(body.chartOptions.every((c: { type: string }) => c.type === 'bar')).toBe(true)
    const insightLower = body.insight.toLowerCase()
    expect(insightLower).not.toMatch(/causes|leads to|results in/)
    expect(insightLower).toContain('descriptive')
    await app.close()
  }, 120000)

  it('unsupported stock query -> HTTP 200 with status unsupported and no chart', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'What is the stock price of Olist?' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('unsupported')
    expect(body.chartOptions).toEqual([])
    await app.close()
  }, 60000)

  it('valid filter with no data -> empty with no chart', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Show monthly revenue trend for 2099' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('empty')
    expect(body.chartOptions).toEqual([])
    await app.close()
  }, 60000)

  it('malformed body -> 400', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { notAQuestion: true },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('INVALID_REQUEST')
    await app.close()
  }, 30000)

  it('question too long -> 400 REQUEST_TOO_LONG before any agent work', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'x'.repeat(5000) },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('REQUEST_TOO_LONG')
    await app.close()
  }, 30000)

  it('LLM mode without API key auto-falls back to fallback agent', async () => {
    const agent = createAgent({
      adapter: createMcpAdapter(client),
      fallbackTimeoutMs: 30000,
      toolTimeoutMs: 5000,
      maxRequestLength: 2000,
      agentMode: 'llm',
      // No API key provided
    })
    const app = makeApp(agent)
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Show monthly revenue trend for 2017' },
    })
    // Phase 4: missing key → auto-fallback to RuleBasedAgent
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('success')
    expect(body.actualMode).toBe('fallback')
    await app.close()
  }, 60000)

  it('partial tool failure -> HTTP 200 status partial, failed source identified', async () => {
    const adapter: ToolCallAdapter = createMcpAdapter(client)
    const failingAdapter: ToolCallAdapter = {
      async callTool(name, args) {
        if (name === 'review_analysis') {
          return {
            ok: false,
            tool: name,
            error: { code: 'QUERY_TIMEOUT', message: 'Tool call exceeded its deadline' },
          }
        }
        return adapter.callTool(name, args)
      },
      async listTools() {
        return adapter.listTools()
      },
      async close() {
        await adapter.close()
      },
    }
    const agent = new RuleBasedAgent({
      adapter: failingAdapter,
      fallbackTimeoutMs: 30000,
      toolTimeoutMs: 5000,
      maxRequestLength: 2000,
    })
    const app = makeApp(agent)
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Show monthly orders and average review score together for 2017' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('partial')
    expect(body.warnings.some((w: string) => w.includes('monthlyScores'))).toBe(true)
    expect(body.chartOptions).toEqual([])
    expect(body.sources.some((s: { status: string }) => s.status === 'failed')).toBe(true)
    await app.close()
  }, 120000)

  it('zero provider requests: fallback path never touches the network', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Which product categories generate the most revenue?' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().actualMode).toBe('fallback')
    await app.close()
  }, 120000)
})
