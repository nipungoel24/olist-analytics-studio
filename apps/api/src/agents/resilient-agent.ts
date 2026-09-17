import type { AgentResult } from '@olist/contracts'
import type { ILLMAgent, AgentRunInput } from './interface.js'

// ResilientAgent: wraps NativeLLMAgent with automatic fallback to
// RuleBasedAgent on provider failures. Routes depend only on ILLMAgent.

export interface ResilientAgentDeps {
  primary: ILLMAgent
  fallback: ILLMAgent
  logger?: (msg: string) => void
}

export class ResilientAgent implements ILLMAgent {
  readonly mode = 'llm' as const

  constructor(private readonly deps: ResilientAgentDeps) {}

  async run(input: AgentRunInput): Promise<AgentResult> {
    try {
      const result = await this.deps.primary.run(input)

      // Also detect error results from the primary agent (e.g., MISSING_PROVIDER_KEY)
      // and fall back, since the primary agent couldn't fulfill the request.
      if (result.status === 'error') {
        const reason = classifyFallbackReason(result.errorCode ?? result.message ?? '')
        if (this.deps.logger) {
          this.deps.logger(`[resilient] primary returned error (${result.errorCode}), falling back`)
        }
        const fallbackResult = await this.deps.fallback.run(input)
        return {
          ...fallbackResult,
          actualMode: 'fallback',
          fallbackReason: `Provider failed: ${reason}. Using deterministic fallback.`,
          warnings: [
            ...fallbackResult.warnings,
            `LLM provider failure: ${reason}`,
          ],
        }
      }

      // Check if any source tool failed with a provider error, even if overall status is 'partial'
      // This handles provider 5xx, rate limit, network failure, auth failure scenarios
      // where some tools succeed but others fail, resulting in 'partial' status
      if (result.status === 'partial' && result.sources) {
        const providerErrors = result.sources.filter(
          (s) => s.status === 'failed' && s.errorCode
        )
        if (providerErrors.length > 0) {
          const errorReasons = providerErrors.map(
            (s) => s.errorCode || 'provider error'
          )
          const reason = classifyFallbackReason(
            errorReasons.join(', ')
          )
          if (this.deps.logger) {
            this.deps.logger(
              `[resilient] primary had provider failures (${providerErrors.length} tools), falling back`
            )
          }
          const fallbackResult = await this.deps.fallback.run(input)
          return {
            ...fallbackResult,
            actualMode: 'fallback',
            fallbackReason:
              `Provider failed: ${reason}. Using deterministic fallback.`,
            warnings: [
              ...fallbackResult.warnings,
              `LLM provider failure: ${reason}. ${providerErrors.length} tool${
                providerErrors.length > 1 ? 's' : ''
              } failed: ${errorReasons.join(', ')}`,
            ],
          }
        }
        // Also check if the overall result contains a provider timeout reason in warnings or text
        const allText = [
          result.insight,
          result.chartReason,
          ...(result.warnings || []),
          ...(result.assumptions || []),
        ]
          .filter((t): t is string => typeof t === 'string')
          .join(' ')
        if (
          allText.toLowerCase().includes('provider timeout') ||
          allText.toLowerCase().includes('model timed out')
        ) {
          if (this.deps.logger) {
            this.deps.logger(
              '[resilient] primary had provider timeout, falling back'
            )
          }
          const fallbackResult = await this.deps.fallback.run(input)
          return {
            ...fallbackResult,
            actualMode: 'fallback',
            fallbackReason:
              'Provider timeout: provider request exceeded deadline. Using deterministic fallback.',
            warnings: [
              ...fallbackResult.warnings,
              'LLM provider timeout: request exceeded analysis deadline',
            ],
          }
        }
      }

      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const reason = classifyFallbackReason(msg)

      if (this.deps.logger) {
        this.deps.logger(`[resilient] provider failed (${reason}), falling back: ${msg.slice(0, 200)}`)
      }

      const fallbackResult = await this.deps.fallback.run(input)
      return {
        ...fallbackResult,
        actualMode: 'fallback',
        fallbackReason: `Provider failed: ${reason}. Using deterministic fallback.`,
        warnings: [
          ...fallbackResult.warnings,
          `LLM provider failure: ${reason}`,
        ],
      }
    }
  }
}

function classifyFallbackReason(errorMsg: string): string {
  const lower = errorMsg.toLowerCase()
  if (lower.includes('missing_provider_key') || lower.includes('auth') || lower.includes('401') || lower.includes('invalid_api_key')) {
    return 'missing or invalid API key'
  }
  if (lower.includes('rate_limit') || lower.includes('429')) {
    return 'provider rate limit'
  }
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('server_error')) {
    return 'provider server error'
  }
  if (lower.includes('timeout') || lower.includes('econnaborted') || lower.includes('model_timeout')) {
    return 'provider timeout'
  }
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('fetch failed')) {
    return 'provider network failure'
  }
  return 'provider error'
}
