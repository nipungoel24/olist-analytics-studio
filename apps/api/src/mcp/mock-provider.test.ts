import { describe, it, expect } from 'vitest'
import { createMockProvider, resetIdCounter } from './mock-provider.js'
import { buildSystemPrompt } from './provider-adapter.js'

describe('mock-provider', () => {
  resetIdCounter()

  it('returns a text-only response', async () => {
    const provider = createMockProvider({
      responses: [{ content: [{ type: 'text', text: 'Hello world' }], stop_reason: 'end_turn' }],
    })
    const signal = new AbortController().signal
    const result = await provider.createMessage([{ role: 'user', content: 'hi' }], signal)

    expect(result.role).toBe('assistant')
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'Hello world' })
    expect(result.stop_reason).toBe('end_turn')
    expect(provider.getCallCount()).toBe(1)
  })

  it('returns a tool_use response', async () => {
    const provider = createMockProvider({
      responses: [{
        content: [{ type: 'tool_use', name: 'order_trends', input: { metric: 'revenue' } }],
        stop_reason: 'tool_use',
      }],
    })
    const signal = new AbortController().signal
    const result = await provider.createMessage([{ role: 'user', content: 'trends' }], signal)

    expect(result.content).toHaveLength(1)
    const block = result.content[0]
    expect(block).toMatchObject({ type: 'tool_use', name: 'order_trends', input: { metric: 'revenue' } })
    expect(result.stop_reason).toBe('tool_use')
  })

  it('chains multiple responses sequentially', async () => {
    const provider = createMockProvider({
      responses: [
        { content: [{ type: 'tool_use', name: 'order_trends', input: {} }], stop_reason: 'tool_use' },
        { content: [{ type: 'text', text: 'The revenue is 100k' }], stop_reason: 'end_turn' },
      ],
    })
    const signal = new AbortController().signal

    const r1 = await provider.createMessage([{ role: 'user', content: 'q1' }], signal)
    expect(r1.stop_reason).toBe('tool_use')

    const r2 = await provider.createMessage([{ role: 'user', content: 'q1' }], signal)
    expect(r2.stop_reason).toBe('end_turn')

    expect(provider.getCallCount()).toBe(2)
  })

  it('throws when no more responses are scripted', async () => {
    const provider = createMockProvider({ responses: [] })
    const signal = new AbortController().signal

    await expect(
      provider.createMessage([{ role: 'user', content: 'q' }], signal),
    ).rejects.toThrow('no response scripted')
  })

  it('throws the scripted error when throw: true', async () => {
    const provider = createMockProvider({
      responses: [{ throw: true, message: 'Auth failed' }],
    })
    const signal = new AbortController().signal

    await expect(
      provider.createMessage([{ role: 'user', content: 'q' }], signal),
    ).rejects.toThrow('Auth failed')
  })

  it('throws on abort signal', async () => {
    const provider = createMockProvider({
      responses: [{ content: [{ type: 'text', text: 'ok' }] }],
    })
    const controller = new AbortController()
    controller.abort()

    await expect(
      provider.createMessage([{ role: 'user', content: 'q' }], controller.signal),
    ).rejects.toThrow('aborted')
  })

  it('tracks last messages', async () => {
    const provider = createMockProvider({
      responses: [{ content: [{ type: 'text', text: 'ok' }] }],
    })
    const signal = new AbortController().signal
    const msgs = [{ role: 'user' as const, content: 'test question' }]
    await provider.createMessage(msgs, signal)

    expect(provider.getLastMessages()).toEqual(msgs)
  })

  it('assigns unique tool_use ids', async () => {
    const provider = createMockProvider({
      responses: [{
        content: [
          { type: 'tool_use', name: 'order_trends', input: {} },
          { type: 'tool_use', name: 'category_performance', input: {} },
        ],
      }],
    })
    resetIdCounter()
    const signal = new AbortController().signal
    const result = await provider.createMessage([{ role: 'user', content: 'q' }], signal)

    const toolBlocks = result.content.filter((b) => b.type === 'tool_use')
    expect(toolBlocks).toHaveLength(2)
    expect(toolBlocks[0].id).not.toBe(toolBlocks[1].id)
  })
})

describe('buildSystemPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildSystemPrompt()
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(100)
  })

  it('mentions all 7 tools', () => {
    const prompt = buildSystemPrompt()
    for (const name of ['dataset_metadata', 'order_trends', 'category_performance', 'seller_performance', 'review_analysis', 'payment_breakdown', 'delivery_performance']) {
      expect(prompt).toContain(name)
    }
  })

  it('includes key rules', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('Never invent numbers')
    expect(prompt).toContain('causal')
  })
})
