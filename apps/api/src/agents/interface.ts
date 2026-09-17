import type { AgentResult } from '@olist/contracts'

// Shared agent contract (Architecture.md §6). Routes depend only on this
// interface. NativeLLMAgent will implement the same interface in Phase 4.

export interface AgentRunInput {
  question: string
  requestId: string
  signal: AbortSignal
}

export interface ILLMAgent {
  readonly mode: 'llm' | 'fallback'
  run(input: AgentRunInput): Promise<AgentResult>
}
