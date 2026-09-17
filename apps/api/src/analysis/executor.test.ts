import { describe, it, expect } from 'vitest'
import type { ToolResponse, ToolResult, ExecutablePlan } from '@olist/contracts'
import { PLAN_VERSION } from '@olist/contracts'
import { executePlan } from './executor.js'
import type { ToolCallAdapter } from '../mcp/adapter.js'

function result(tool: string, rows: Array<Record<string, unknown>>, dataVersion = 'v1'): ToolResult {
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
      dataVersion,
    },
  }
}

interface FakeAdapter extends ToolCallAdapter {
  calls: Array<{ name: string; args: Record<string, unknown> }>
}

function makeAdapter(handler: (name: string, args: Record<string, unknown>) => Promise<ToolResponse> | ToolResponse): FakeAdapter {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  return {
    calls,
    async callTool(name, args) {
      calls.push({ name, args })
      return handler(name, args)
    },
    async listTools() {
      return []
    },
    async close() {},
  }
}

function plan(overrides: Partial<ExecutablePlan> = {}): ExecutablePlan {
  return {
    planVersion: PLAN_VERSION,
    intent: 'test',
    question: 'test',
    filters: {},
    assumptions: [],
    cohort: 'test',
    nodes: [],
    merge: null,
    chart: { chartType: 'bar', chartReason: 'test' },
    ...overrides,
  }
}

describe('executePlan', () => {
  it('runs independent nodes concurrently', async () => {
    const adapter = makeAdapter((name) => {
      if (name === 'a') return result('a', [{ v: 1 }])
      return result('b', [{ v: 2 }])
    })
    const p = plan({
      nodes: [
        { nodeId: 'n1', tool: 'a', params: {}, bindings: [], dependsOn: [] },
        { nodeId: 'n2', tool: 'b', params: {}, bindings: [], dependsOn: [] },
      ],
    })
    const exec = await executePlan(p, { adapter, overallDeadlineMs: 10000, toolTimeoutMs: 5000 })
    expect(exec.failedNodeIds).toEqual([])
    expect(exec.outcomes.get('n1')?.status).toBe('success')
    expect(exec.outcomes.get('n2')?.status).toBe('success')
    expect(exec.dataVersion).toBe('v1')
  })

  it('resolves fan-out bindings from dependency rows (Q7 dynamic semantics)', async () => {
    const adapter = makeAdapter((name, args) => {
      if (name === 'category_performance') {
        return result('category_performance', [
          { category_english: 'alpha', metric_value: 10 },
          { category_english: 'beta', metric_value: 5 },
        ])
      }
      if (name === 'review_analysis') {
        const cat = args['category'] as string
        return result('review_analysis', [{ category: cat, metric_value: cat === 'alpha' ? 4.5 : 3.9 }])
      }
      return { ok: false, tool: name, error: { code: 'INTERNAL_ERROR', message: 'unknown tool' } }
    })
    const p = plan({
      nodes: [
        { nodeId: 'categoryRanking', tool: 'category_performance', params: {}, bindings: [], dependsOn: [] },
        {
          nodeId: 'categoryReviews',
          tool: 'review_analysis',
          params: { metric: 'average_score' },
          bindings: [{ param: 'category', fromNode: 'categoryRanking', field: 'category_english', mode: 'fan_out' }],
          dependsOn: ['categoryRanking'],
        },
      ],
    })
    const exec = await executePlan(p, { adapter, overallDeadlineMs: 10000, toolTimeoutMs: 5000 })
    const reviews = exec.outcomes.get('categoryReviews')
    expect(reviews?.status).toBe('success')
    expect(reviews?.boundResults).toHaveLength(2)
    const reviewCalls = adapter.calls.filter((c) => c.name === 'review_analysis')
    expect(reviewCalls.map((c) => c.args['category']).sort()).toEqual(['alpha', 'beta'])
  })

  it('binds a fresh dependency ranking at execution time (no frozen IDs in the plan)', async () => {
    const adapter = makeAdapter((name) => {
      if (name === 'category_performance') {
        return result('category_performance', [{ category_english: 'changed-cat', metric_value: 99 }])
      }
      return result('review_analysis', [{ metric_value: 4.0 }])
    })
    const p = plan({
      nodes: [
        { nodeId: 'rank', tool: 'category_performance', params: {}, bindings: [], dependsOn: [] },
        {
          nodeId: 'reviews',
          tool: 'review_analysis',
          params: {},
          bindings: [{ param: 'category', fromNode: 'rank', field: 'category_english', mode: 'fan_out' }],
          dependsOn: ['rank'],
        },
      ],
    })
    const exec = await executePlan(p, { adapter, overallDeadlineMs: 10000, toolTimeoutMs: 5000 })
    expect(exec.outcomes.get('reviews')?.status).toBe('success')
    expect(adapter.calls.find((c) => c.name === 'review_analysis')!.args['category']).toBe('changed-cat')
  })

  it('preserves successful siblings when one node fails (allSettled semantics)', async () => {
    const adapter = makeAdapter((name) => {
      if (name === 'a') return result('a', [{ v: 1 }])
      return { ok: false, tool: 'b', error: { code: 'QUERY_TIMEOUT', message: 'timed out' } }
    })
    const p = plan({
      nodes: [
        { nodeId: 'n1', tool: 'a', params: {}, bindings: [], dependsOn: [] },
        { nodeId: 'n2', tool: 'b', params: {}, bindings: [], dependsOn: [] },
      ],
    })
    const exec = await executePlan(p, { adapter, overallDeadlineMs: 10000, toolTimeoutMs: 5000 })
    expect(exec.outcomes.get('n1')?.status).toBe('success')
    expect(exec.failedNodeIds).toEqual(['n2'])
  })

  it('fails dependent nodes when a dependency fails', async () => {
    const adapter = makeAdapter((name) => {
      if (name === 'dep') return { ok: false, tool: 'dep', error: { code: 'EMPTY_RESULT', message: 'no rows' } }
      return result('child', [{ v: 1 }])
    })
    const p = plan({
      nodes: [
        { nodeId: 'dep', tool: 'dep', params: {}, bindings: [], dependsOn: [] },
        { nodeId: 'child', tool: 'child', params: {}, bindings: [], dependsOn: ['dep'] },
      ],
    })
    const exec = await executePlan(p, { adapter, overallDeadlineMs: 10000, toolTimeoutMs: 5000 })
    expect(exec.outcomes.get('child')?.status).toBe('failed')
    expect(exec.outcomes.get('child')?.errorMessage).toContain('dependency')
  })

  it('times out a slow tool and marks it failed without killing siblings', async () => {
    const adapter = makeAdapter((name) => {
      if (name === 'slow') {
        return new Promise((resolve) => setTimeout(() => resolve(result('slow', [{ v: 1 }])), 2000))
      }
      return result('fast', [{ v: 2 }])
    })
    const p = plan({
      nodes: [
        { nodeId: 'slow', tool: 'slow', params: {}, bindings: [], dependsOn: [] },
        { nodeId: 'fast', tool: 'fast', params: {}, bindings: [], dependsOn: [] },
      ],
    })
    const exec = await executePlan(p, { adapter, overallDeadlineMs: 10000, toolTimeoutMs: 100 })
    expect(exec.outcomes.get('slow')?.status).toBe('failed')
    expect(exec.outcomes.get('slow')?.errorCode).toBe('QUERY_TIMEOUT')
    expect(exec.outcomes.get('fast')?.status).toBe('success')
  })

  it('respects an aborted signal', async () => {
    const adapter = makeAdapter((name) => {
      if (name === 'slow') {
        return new Promise((resolve) => setTimeout(() => resolve(result('slow', [{ v: 1 }])), 500))
      }
      return result('fast', [{ v: 2 }])
    })
    const controller = new AbortController()
    const p = plan({
      nodes: [{ nodeId: 'slow', tool: 'slow', params: {}, bindings: [], dependsOn: [] }],
    })
    setTimeout(() => controller.abort(), 20)
    const exec = await executePlan(p, { adapter, overallDeadlineMs: 10000, toolTimeoutMs: 5000 }, controller.signal)
    expect(exec.outcomes.get('slow')?.status).toBe('failed')
  })

  it('detects data-version mismatch across nodes and fails on retry exhaustion', async () => {
    let bCalls = 0
    const adapter = makeAdapter((name) => {
      if (name === 'a') return result('a', [{ v: 1 }], 'version-A')
      bCalls++
      return result('b', [{ v: 2 }], 'version-B')
    })
    const p = plan({
      nodes: [
        { nodeId: 'a', tool: 'a', params: {}, bindings: [], dependsOn: [] },
        { nodeId: 'b', tool: 'b', params: {}, bindings: [], dependsOn: [] },
      ],
    })
    const exec = await executePlan(p, { adapter, overallDeadlineMs: 10000, toolTimeoutMs: 5000 })
    expect(bCalls).toBe(2)
    expect(exec.outcomes.get('b')?.status).toBe('failed')
    expect(exec.outcomes.get('b')?.errorCode).toBe('DATA_VERSION_CONFLICT')
  })

  it('recovers when a mismatched node retries onto the bound version', async () => {
    let bCalls = 0
    const adapter = makeAdapter((name) => {
      if (name === 'a') return result('a', [{ v: 1 }], 'version-A')
      bCalls++
      return result('b', [{ v: 2 }], bCalls === 1 ? 'version-B' : 'version-A')
    })
    const p = plan({
      nodes: [
        { nodeId: 'a', tool: 'a', params: {}, bindings: [], dependsOn: [] },
        { nodeId: 'b', tool: 'b', params: {}, bindings: [], dependsOn: [] },
      ],
    })
    const exec = await executePlan(p, { adapter, overallDeadlineMs: 10000, toolTimeoutMs: 5000 })
    expect(bCalls).toBe(2)
    expect(exec.outcomes.get('b')?.status).toBe('success')
  })
})
