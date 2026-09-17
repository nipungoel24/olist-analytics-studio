import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { join } from 'path'
import { buildApp } from '@olist/api'
import { createAgent, RuleBasedAgent, type ILLMAgent } from '@olist/api/agents'
import { createMcpAdapter, type ToolCallAdapter } from '@olist/api/mcp'
import { createAppDb, type AppDb } from '@olist/api/db/pool'

// Phase 5 pin and refresh integration tests.

const MCP_SERVER_PATH = join(import.meta.dirname, '..', '..', 'apps', 'mcp', 'dist', 'server.js')
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://olist:olist_dev@127.0.0.1:5433/olist'

let client: Client
let transport: StdioClientTransport
let db: AppDb

beforeAll(async () => {
  transport = new StdioClientTransport({ command: 'node', args: [MCP_SERVER_PATH] })
  client = new Client({ name: 'phase5-pin-test', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
  db = createAppDb(DATABASE_URL)
}, 30000)

afterAll(async () => {
  await client.close().catch(() => {})
  await transport.close().catch(() => {})
  await db.close().catch(() => {})
})

function makeApp(agentOverride?: ILLMAgent, persist = true) {
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
    db,
    adapter,
    maxRequestLength: 2000,
    persistResults: persist,
  })
}

describe('POST /api/pins', () => {
  it('creates a pin from a successful analysis', async () => {
    const app = makeApp()
    
    // First create an analysis
    const analysisRes = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Show monthly revenue trend for 2017' },
    })
    expect(analysisRes.statusCode).toBe(200)
    const analysis = analysisRes.json()
    expect(analysis.status).toBe('success')
    expect(analysis.analysisId).toBeDefined()
    
    // Create a pin
    const pinRes = await app.inject({
      method: 'POST',
      url: '/api/pins',
      payload: { analysisId: analysis.analysisId },
    })
    expect(pinRes.statusCode).toBe(201)
    const pin = pinRes.json()
    expect(pin.pinId).toBeDefined()
    expect(pin.analysisId).toBe(analysis.analysisId)
    
    await app.close()
  }, 120000)

  it('returns 404 for missing analysis', async () => {
    const app = makeApp()
    
    const res = await app.inject({
      method: 'POST',
      url: '/api/pins',
      payload: { analysisId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('NOT_FOUND')
    
    await app.close()
  })

  it('returns 400 for invalid request body', async () => {
    const app = makeApp()
    
    const res = await app.inject({
      method: 'POST',
      url: '/api/pins',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('INVALID_REQUEST')
    
    await app.close()
  })

  it('returns existing pin for duplicate request (idempotent)', async () => {
    const app = makeApp()
    
    // Create analysis
    const analysisRes = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'What share of payments are credit card vs boleto?' },
    })
    const analysis = analysisRes.json()
    
    // Create pin
    const pin1Res = await app.inject({
      method: 'POST',
      url: '/api/pins',
      payload: { analysisId: analysis.analysisId },
    })
    expect(pin1Res.statusCode).toBe(201)
    const pin1 = pin1Res.json()
    
    // Create duplicate pin
    const pin2Res = await app.inject({
      method: 'POST',
      url: '/api/pins',
      payload: { analysisId: analysis.analysisId },
    })
    expect(pin2Res.statusCode).toBe(200) // Idempotent
    const pin2 = pin2Res.json()
    expect(pin2.pinId).toBe(pin1.pinId) // Same pin
    
    await app.close()
  }, 120000)
})

describe('GET /api/pins', () => {
  it('lists all pins', async () => {
    const app = makeApp()
    
    // Create a pin
    const analysisRes = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Top 10 sellers by revenue in São Paulo' },
    })
    const analysis = analysisRes.json()
    
    await app.inject({
      method: 'POST',
      url: '/api/pins',
      payload: { analysisId: analysis.analysisId, title: 'Test Pin' },
    })
    
    // List pins
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/pins',
    })
    expect(listRes.statusCode).toBe(200)
    const pins = listRes.json()
    expect(Array.isArray(pins)).toBe(true)
    expect(pins.length).toBeGreaterThan(0)
    
    const pin = pins.find((p: any) => p.analysisId === analysis.analysisId)
    expect(pin).toBeDefined()
    expect(pin.title).toBe('Test Pin')
    
    await app.close()
  }, 120000)
})

describe('DELETE /api/pins/:id', () => {
  it('deletes an existing pin', async () => {
    const app = makeApp()
    
    // Create a pin
    const analysisRes = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Show review score distribution for electronics' },
    })
    const analysis = analysisRes.json()
    
    const pinRes = await app.inject({
      method: 'POST',
      url: '/api/pins',
      payload: { analysisId: analysis.analysisId },
    })
    const pin = pinRes.json()
    
    // Delete pin
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/pins/${pin.pinId}`,
    })
    expect(deleteRes.statusCode).toBe(200)
    expect(deleteRes.json().success).toBe(true)
    
    // Verify deleted
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/pins',
    })
    const pins = listRes.json()
    expect(pins.find((p: any) => p.pinId === pin.pinId)).toBeUndefined()
    
    await app.close()
  }, 120000)

  it('returns 404 for missing pin', async () => {
    const app = makeApp()
    
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/pins/00000000-0000-0000-0000-000000000000',
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('NOT_FOUND')
    
    await app.close()
  })
})

describe('POST /api/pins/:id/refresh', () => {
  it('refreshes a pin without LLM calls', async () => {
    const app = makeApp()
    
    // Create an analysis
    const analysisRes = await app.inject({
      method: 'POST',
      url: '/api/analyses',
      payload: { question: 'Show monthly revenue trend for 2017' },
    })
    const analysis = analysisRes.json()
    
    // Create a pin
    const pinRes = await app.inject({
      method: 'POST',
      url: '/api/pins',
      payload: { analysisId: analysis.analysisId },
    })
    const pin = pinRes.json()
    
    // Refresh the pin
    const refreshRes = await app.inject({
      method: 'POST',
      url: `/api/pins/${pin.pinId}/refresh`,
    })
    expect(refreshRes.statusCode).toBe(200)
    const refresh = refreshRes.json()
    expect(refresh.refreshId).toBeDefined()
    expect(refresh.status).toBeDefined()
    expect(refresh.diff).toBeDefined()
    
    await app.close()
  }, 120000)

  it('returns 404 for missing pin', async () => {
    const app = makeApp()
    
    const res = await app.inject({
      method: 'POST',
      url: '/api/pins/00000000-0000-0000-0000-000000000000/refresh',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('REFRESH_FAILED')
    
    await app.close()
  })
})
