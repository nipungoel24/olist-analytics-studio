import { describe, it, expect } from 'vitest'
import type { AgentResult } from '@olist/contracts'
import type { ILLMAgent, AgentRunInput } from './interface.js'
import { ResilientAgent } from './resilient-agent.js'
import { validateAgentResult } from '@olist/contracts'

function makeInput(overrides?: Partial<AgentRunInput>): AgentRunInput {
  return {
    question: 'Show monthly revenue trend for 2017',
    requestId: 'req-test',
    signal: new AbortController().signal,
    ...overrides,
  }
}

function successResult(mode: string = 'llm'): AgentResult {
  return validateAgentResult({
    status: 'success',
    originalQuestion: 'test',
    actualMode: mode as any,
    resolvedFilters: {},
    assumptions: [],
    normalizedData: null,
    chartOptions: [],
    chartType: null,
    chartReason: null,
    insight: null,
    warnings: [],
    sources: [],
    dataVersion: null,
    executablePlan: null,
  })
}

function errorResult(errorCode: string, message: string): AgentResult {
  return validateAgentResult({
    status: 'error',
    originalQuestion: 'test',
    actualMode: 'llm',
    resolvedFilters: {},
    assumptions: [],
    normalizedData: null,
    chartOptions: [],
    chartType: null,
    chartReason: null,
    insight: null,
    warnings: [],
    sources: [],
    dataVersion: null,
    executablePlan: null,
    message,
    errorCode,
  })
}

function makeAgent(
  primaryResult: AgentResult | Error,
  fallbackResult: AgentResult = successResult('fallback'),
) {
  const counters = { primaryCalls: 0, fallbackCalls: 0 }

  const primary: ILLMAgent = {
    mode: 'llm' as const,
    async run() {
      counters.primaryCalls++
      if (primaryResult instanceof Error) throw primaryResult
      return primaryResult
    },
  }

  const fallback: ILLMAgent = {
    mode: 'fallback' as const,
    async run() {
      counters.fallbackCalls++
      return fallbackResult
    },
  }

  const agent = new ResilientAgent({ primary, fallback })
  return { agent, counters }
}

describe('ResilientAgent', () => {
  it('returns primary result on success', async () => {
    const { agent, counters } = makeAgent(successResult())
    const result = await agent.run(makeInput())

    expect(result.status).toBe('success')
    expect(result.actualMode).toBe('llm')
    expect(counters.primaryCalls).toBe(1)
    expect(counters.fallbackCalls).toBe(0)
  })

  it('falls back when primary throws an error', async () => {
    const { agent, counters } = makeAgent(
      new Error('PROVIDER_AUTH_FAILURE: bad key'),
    )
    const result = await agent.run(makeInput())

    expect(result.status).toBe('success')
    expect(result.actualMode).toBe('fallback')
    expect(result.fallbackReason).toContain('missing or invalid API key')
    expect(counters.primaryCalls).toBe(1)
    expect(counters.fallbackCalls).toBe(1)
  })

  it('falls back when primary returns an error result (MISSING_PROVIDER_KEY)', async () => {
    const { agent, counters } = makeAgent(
      errorResult('MISSING_PROVIDER_KEY', 'ANTHROPIC_API_KEY is missing'),
    )
    const result = await agent.run(makeInput())

    expect(result.status).toBe('success')
    expect(result.actualMode).toBe('fallback')
    expect(result.fallbackReason).toContain('missing or invalid API key')
    expect(counters.primaryCalls).toBe(1)
    expect(counters.fallbackCalls).toBe(1)
  })

  it('appends warning about LLM provider failure', async () => {
    const { agent } = makeAgent(errorResult('MISSING_PROVIDER_KEY', 'key missing'))
    const result = await agent.run(makeInput())

    expect(result.warnings.some((w) => w.includes('LLM provider failure'))).toBe(true)
  })

  it('classifies rate limit errors', async () => {
    const { agent } = makeAgent(new Error('429 rate_limit'))
    const result = await agent.run(makeInput())

    expect(result.fallbackReason).toContain('rate limit')
  })

  it('classifies timeout errors', async () => {
    const { agent } = makeAgent(new Error('timeout ECONNABORTED'))
    const result = await agent.run(makeInput())

    expect(result.fallbackReason).toContain('timeout')
  })

  it('classifies server errors', async () => {
    const { agent } = makeAgent(new Error('500 internal server error'))
    const result = await agent.run(makeInput())

    expect(result.fallbackReason).toContain('server error')
  })

  it('classifies network errors', async () => {
    const { agent } = makeAgent(new Error('network fetch failed'))
    const result = await agent.run(makeInput())

    expect(result.fallbackReason).toContain('network failure')
  })

  it('classifies generic provider errors', async () => {
    const { agent } = makeAgent(new Error('unknown provider issue'))
    const result = await agent.run(makeInput())

    expect(result.fallbackReason).toContain('provider error')
  })

  it('throws if both primary and fallback fail', async () => {
    const primary: ILLMAgent = {
      mode: 'llm' as const,
      async run() { throw new Error('primary failed') },
    }
    const fallback: ILLMAgent = {
      mode: 'fallback' as const,
      async run() { throw new Error('fallback also failed') },
    }
    const agent = new ResilientAgent({ primary, fallback })

    await expect(agent.run(makeInput())).rejects.toThrow('fallback also failed')
  })

  it('mode is always llm', () => {
    const { agent } = makeAgent(successResult())
    expect(agent.mode).toBe('llm')
  })
})
