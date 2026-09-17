import type { AgentResult } from '@olist/contracts'
import { validateAgentResult } from '@olist/contracts'
import type { ILLMAgent, AgentRunInput } from './interface.js'
import { RuleBasedAgent, type RuleBasedAgentDeps } from './rule-based-agent.js'
import { NativeLLMAgent } from './native-llm-agent.js'
import { ResilientAgent } from './resilient-agent.js'
import type { ProviderAdapter } from '../mcp/provider-adapter.js'

// Agent factory (Architecture.md §6). Routes know only ILLMAgent.
// Phase 4 adds NativeLLMAgent with automatic ResilientAgent wrapping.

class MissingKeyAgent implements ILLMAgent {
  readonly mode = 'llm' as const

  async run(input: AgentRunInput): Promise<AgentResult> {
    return validateAgentResult({
      status: 'error',
      originalQuestion: input.question,
      actualMode: 'fallback',
      fallbackReason: 'ANTHROPIC_API_KEY is missing',
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
      message: 'AGENT_MODE=llm requires ANTHROPIC_API_KEY. Set the key or use AGENT_MODE=fallback.',
      errorCode: 'MISSING_PROVIDER_KEY',
    })
  }
}

export interface AgentFactoryDeps extends RuleBasedAgentDeps {
  agentMode: string
  anthropicApiKey?: string | null
  llmModel?: string
  modelTimeoutMs?: number
  maxModelTurns?: number
  maxToolCalls?: number
  providerAdapter?: ProviderAdapter | null
}

export function createAgent(deps: AgentFactoryDeps): ILLMAgent {
  const mode = deps.agentMode.trim().toLowerCase()

  // Always create the fallback agent for ResilientAgent and for fallback mode
  const fallbackAgent = new RuleBasedAgent({
    adapter: deps.adapter,
    fallbackTimeoutMs: deps.fallbackTimeoutMs,
    toolTimeoutMs: deps.toolTimeoutMs,
    maxRequestLength: deps.maxRequestLength,
    logger: deps.logger,
  })

  if (mode === 'llm') {
    const apiKey = deps.anthropicApiKey?.trim()
    if (!apiKey || !deps.providerAdapter) {
      if (deps.logger) deps.logger('[factory] ANTHROPIC_API_KEY missing or provider not configured, using MissingKeyAgent (auto-fallback)')
      // Wrap MissingKeyAgent in ResilientAgent so it auto-falls back to RuleBasedAgent
      return new ResilientAgent({
        primary: new MissingKeyAgent(),
        fallback: fallbackAgent,
        logger: deps.logger,
      })
    }

    const nativeAgent = new NativeLLMAgent({
      provider: deps.providerAdapter,
      adapter: deps.adapter,
      modelTimeoutMs: deps.modelTimeoutMs ?? 25000,
      toolTimeoutMs: deps.toolTimeoutMs,
      maxRequestLength: deps.maxRequestLength,
      maxModelTurns: deps.maxModelTurns ?? 4,
      maxToolCalls: deps.maxToolCalls ?? 8,
      logger: deps.logger,
    })

    return new ResilientAgent({
      primary: nativeAgent,
      fallback: fallbackAgent,
      logger: deps.logger,
    })
  }

  return fallbackAgent
}
