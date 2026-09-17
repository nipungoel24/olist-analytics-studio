import type Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages.js'
import type { ProviderAdapter } from './provider-adapter.js'

// MockProviderAdapter: scripted provider for unit tests. Supports
// sequenced responses, error injection, timeout simulation, abort-signal
// testing, and dynamic responses based on conversation history. No real SDK calls.

export interface MockToolCall {
  type: 'tool_use'
  name: string
  input: Record<string, unknown>
}

export interface MockTextBlock {
  type: 'text'
  text: string
}

export type MockResponseBlock = MockToolCall | MockTextBlock

export interface MockProviderResponse {
  content: MockResponseBlock[]
  stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens'
}

export type MockProviderError = {
  throw: true
  message: string
}

/**
 * Dynamic response generator: receives conversation history and returns
 * a response based on prior tool results. Used for testing fan-out patterns
 * where Turn 2 depends on Turn 1 results (e.g., Q7: category_performance
 * returns categories, then review_analysis must be called per category).
 */
export type MockDynamicResponse = {
  dynamic: true
  /** Receive full conversation history, return a response */
  generate: (messages: MessageParam[]) => MockProviderResponse
}

export interface MockProviderOptions {
  responses: Array<MockProviderResponse | MockProviderError | MockDynamicResponse>
  model?: string
  delayMs?: number
}

let idCounter = 0
function nextId(): string {
  idCounter++
  return `toolu_${idCounter.toString(36).padStart(8, '0')}`
}

export function createMockProvider(options: MockProviderOptions): ProviderAdapter & {
  getCallCount: () => number
  getLastMessages: () => MessageParam[] | null
} {
  let callIndex = 0
  let callCount = 0
  let lastMessages: MessageParam[] | null = null

  const provider: ProviderAdapter & {
    getCallCount: () => number
    getLastMessages: () => MessageParam[] | null
  } = {
    async createMessage(messages: MessageParam[], signal: AbortSignal): Promise<Anthropic.Message> {
      if (signal.aborted) {
        throw new Error('This operation was aborted')
      }

      if (options.delayMs) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.delayMs!)
          signal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new Error('This operation was aborted'))
          }, { once: true })
        })
        if (signal.aborted) {
          throw new Error('This operation was aborted')
        }
      }

      if (callIndex >= options.responses.length) {
        throw new Error(`MockProvider: no response scripted for call ${callIndex}`)
      }

      lastMessages = messages
      callCount++
      const scripted = options.responses[callIndex]!
      callIndex++

      if ('throw' in scripted && scripted.throw) {
        throw new Error(scripted.message)
      }

      // Handle dynamic response generator
      if ('dynamic' in scripted && scripted.dynamic) {
        const resp = scripted.generate(messages)
        const content = resp.content.map((block): any => {
          if (block.type === 'tool_use') {
            return {
              type: 'tool_use',
              id: nextId(),
              name: block.name,
              input: block.input,
            }
          }
          return {
            type: 'text',
            text: block.text,
          }
        })

        return {
          id: `msg_mock_${callIndex}`,
          type: 'message',
          role: 'assistant',
          content,
          model: options.model ?? 'claude-sonnet-4-20250514',
          stop_reason: resp.stop_reason ?? (content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        } as unknown as Anthropic.Message
      }

      const resp = scripted as MockProviderResponse
      const content = resp.content.map((block): any => {
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: nextId(),
            name: block.name,
            input: block.input,
          }
        }
        return {
          type: 'text',
          text: block.text,
        }
      })

      return {
        id: `msg_mock_${callIndex}`,
        type: 'message',
        role: 'assistant',
        content,
        model: options.model ?? 'claude-sonnet-4-20250514',
        stop_reason: resp.stop_reason ?? (content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      } as unknown as Anthropic.Message
    },

    getCallCount() {
      return callCount
    },

    getLastMessages() {
      return lastMessages
    },
  }

  return provider
}

export function resetIdCounter(): void {
  idCounter = 0
}
