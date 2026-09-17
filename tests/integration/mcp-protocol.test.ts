import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { join } from 'path'

const MCP_SERVER_PATH = join(import.meta.dirname, '..', '..', 'apps', 'mcp', 'dist', 'server.js')

let transport: StdioClientTransport
let client: Client

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: 'node',
    args: [MCP_SERVER_PATH],
  })
  client = new Client(
    { name: 'test-client', version: '0.1.0' },
    { capabilities: {} }
  )
  await client.connect(transport)
}, 30000)

afterAll(async () => {
  if (client) {
    await client.close().catch(() => {})
  }
  if (transport) {
    await transport.close().catch(() => {})
  }
})

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as Array<{ type: string; text: string }>
  const text = content[0]!.text
  try {
    return JSON.parse(text)
  } catch {
    // SDK validation errors return plain text, not JSON
    return {
      ok: false,
      tool: name,
      error: {
        code: 'INVALID_INPUT',
        message: text,
      },
    }
  }
}

describe('MCP Protocol Integration', () => {
  it('should discover all 7 tools via listTools', async () => {
    const result = await client.listTools()
    const toolNames = result.tools.map((t) => t.name)
    expect(toolNames).toContain('dataset_metadata')
    expect(toolNames).toContain('order_trends')
    expect(toolNames).toContain('category_performance')
    expect(toolNames).toContain('seller_performance')
    expect(toolNames).toContain('review_analysis')
    expect(toolNames).toContain('payment_breakdown')
    expect(toolNames).toContain('delivery_performance')
    expect(toolNames.length).toBe(7)
  })

  it('should call dataset_metadata successfully', async () => {
    const result = await callTool('dataset_metadata', {})
    expect(result.ok).toBe(true)
    expect(result.tool).toBe('dataset_metadata')
    expect(result.data).toBeDefined()
    expect((result.data as Array<Record<string, unknown>>)[0].dateRange).toBeDefined()
  })

  it('should call order_trends with default parameters', async () => {
    const result = await callTool('order_trends', {
      from: '2017-01-01', to: '2017-12-31',
      granularity: 'month', metric: 'revenue',
    })
    expect(result.ok).toBe(true)
    expect(result.tool).toBe('order_trends')
    expect(result.meta.rowCount).toBeGreaterThan(0)
  })

  it('should call category_performance successfully', async () => {
    const result = await callTool('category_performance', {
      from: '2017-01-01', to: '2017-12-31',
      metric: 'revenue', limit: 5, sort: 'desc',
    })
    expect(result.ok).toBe(true)
    expect(result.tool).toBe('category_performance')
    expect(result.data).toBeDefined()
    expect(result.meta.rowCount).toBeGreaterThan(0)
  })

  it('should call seller_performance successfully', async () => {
    const result = await callTool('seller_performance', {
      from: '2017-01-01', to: '2017-12-31',
      metric: 'revenue', limit: 5, sort: 'desc',
    })
    expect(result.ok).toBe(true)
    expect(result.tool).toBe('seller_performance')
    expect(result.data).toBeDefined()
    expect(result.meta.rowCount).toBeGreaterThan(0)
  })

  it('should call review_analysis successfully', async () => {
    const result = await callTool('review_analysis', {
      from: '2017-01-01', to: '2017-12-31',
      metric: 'score_distribution',
    })
    expect(result.ok).toBe(true)
    expect(result.tool).toBe('review_analysis')
    expect(result.data).toBeDefined()
    expect(result.meta.rowCount).toBe(5)
  })

  it('should call payment_breakdown successfully', async () => {
    const result = await callTool('payment_breakdown', {
      from: '2017-01-01', to: '2017-12-31',
      metric: 'payment_value', group_by: 'payment_type',
    })
    expect(result.ok).toBe(true)
    expect(result.tool).toBe('payment_breakdown')
    expect(result.data).toBeDefined()
    expect(result.meta.rowCount).toBeGreaterThan(0)
  })

  it('should call delivery_performance successfully', async () => {
    const result = await callTool('delivery_performance', {
      from: '2017-01-01', to: '2017-12-31',
      metric: 'on_time_rate', group_by: 'state', limit: 10, sort: 'desc',
    })
    expect(result.ok).toBe(true)
    expect(result.tool).toBe('delivery_performance')
    expect(result.data).toBeDefined()
    expect(result.meta.rowCount).toBeGreaterThan(0)
  })

  it('should handle invalid date range gracefully', async () => {
    const result = await callTool('order_trends', {
      from: '2017-12-31', to: '2017-01-01',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error.code).toBe('INVALID_DATE_RANGE')
  })

  it('should handle empty result gracefully', async () => {
    const result = await callTool('category_performance', {
      from: '2099-01-01', to: '2099-12-31',
      metric: 'revenue', limit: 10, sort: 'desc',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error.code).toBe('EMPTY_RESULT')
  })

  it('should handle invalid state parameter with structured error', async () => {
    const result = await callTool('seller_performance', {
      state: 'INVALID', metric: 'revenue', limit: 10, sort: 'desc',
    })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('INVALID_INPUT')
    expect(result.error.message.toLowerCase()).toContain('invalid')
    const followUp = await callTool('order_trends', {
      from: '2017-01-01', to: '2017-12-31', metric: 'revenue',
    })
    expect(followUp.ok).toBe(true)
  })

  it('should handle invalid metric gracefully with structured error', async () => {
    const result = await callTool('order_trends', { metric: 'invalid_metric' })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('INVALID_INPUT')
    const followUp = await callTool('order_trends', {
      from: '2017-01-01', to: '2017-12-31', metric: 'revenue',
    })
    expect(followUp.ok).toBe(true)
  })

  it('should handle invalid limit with structured error', async () => {
    const result = await callTool('category_performance', {
      from: '2017-01-01', to: '2017-12-31',
      metric: 'revenue', limit: 200,
    })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('INVALID_INPUT')
  })

  it('should handle malformed date with structured error', async () => {
    const result = await callTool('order_trends', {
      from: 'not-a-date', to: '2017-12-31',
    })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('INVALID_INPUT')
  })

  it('should handle unknown category rejection with structured error', async () => {
    const result = await callTool('category_performance', {
      from: '2017-01-01', to: '2017-12-31',
      metric: 'revenue', category: 'nonexistent_category_xyz',
    })
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('UNKNOWN_CATEGORY')
    expect(result.error.message).toContain('nonexistent_category_xyz')
  })
})
