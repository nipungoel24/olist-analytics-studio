import { describe, it, expect } from 'vitest'
import { getProviderToolDefinitions, getProviderToolNames } from './tool-schemas.js'

describe('tool-schemas', () => {
  const tools = getProviderToolDefinitions()

  it('returns exactly 7 tool definitions', () => {
    expect(tools).toHaveLength(7)
  })

  it('each tool has name, description, and input_schema', () => {
    for (const tool of tools) {
      expect(typeof tool.name).toBe('string')
      expect(tool.name.length).toBeGreaterThan(0)
      expect(typeof tool.description).toBe('string')
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.input_schema).toBeDefined()
      expect(tool.input_schema.type).toBe('object')
    }
  })

  it('includes all expected tool names', () => {
    const names = getProviderToolNames()
    expect(names).toEqual([
      'dataset_metadata',
      'order_trends',
      'category_performance',
      'seller_performance',
      'review_analysis',
      'payment_breakdown',
      'delivery_performance',
    ])
  })

  it('dataset_metadata has no required parameters', () => {
    const meta = tools.find((t) => t.name === 'dataset_metadata')!
    expect(meta.input_schema.properties).toEqual({})
  })

  it('order_trends has metric enum with correct values', () => {
    const trend = tools.find((t) => t.name === 'order_trends')!
    const metricProp = trend.input_schema.properties as Record<string, unknown>
    expect((metricProp.metric as { enum: string[] }).enum).toEqual([
      'revenue', 'order_count', 'average_delivery_days', 'on_time_rate',
    ])
  })

  it('order_trends has granularity enum', () => {
    const trend = tools.find((t) => t.name === 'order_trends')!
    const props = trend.input_schema.properties as Record<string, unknown>
    expect((props.granularity as { enum: string[] }).enum).toEqual([
      'day', 'week', 'month', 'quarter', 'year',
    ])
  })

  it('category_performance has metric enum', () => {
    const cat = tools.find((t) => t.name === 'category_performance')!
    const props = cat.input_schema.properties as Record<string, unknown>
    expect((props.metric as { enum: string[] }).enum).toEqual([
      'revenue', 'order_count', 'average_review_score', 'total_freight', 'item_count',
    ])
  })

  it('seller_performance has group_by options', () => {
    const seller = tools.find((t) => t.name === 'seller_performance')!
    const props = seller.input_schema.properties as Record<string, unknown>
    expect(props.state).toBeDefined()
    expect(props.seller_id).toBeDefined()
    expect(props.limit).toBeDefined()
  })

  it('review_analysis has group_by enum', () => {
    const review = tools.find((t) => t.name === 'review_analysis')!
    const props = review.input_schema.properties as Record<string, unknown>
    expect((props.group_by as { enum: string[] }).enum).toEqual([
      'none', 'month', 'state', 'seller',
    ])
  })

  it('payment_breakdown has payment_type enum support', () => {
    const payment = tools.find((t) => t.name === 'payment_breakdown')!
    const props = payment.input_schema.properties as Record<string, unknown>
    expect((props.metric as { enum: string[] }).enum).toEqual([
      'payment_value', 'payment_count', 'order_count', 'average_installments',
    ])
  })

  it('delivery_performance has group_by enum', () => {
    const delivery = tools.find((t) => t.name === 'delivery_performance')!
    const props = delivery.input_schema.properties as Record<string, unknown>
    expect((props.group_by as { enum: string[] }).enum).toEqual([
      'state', 'seller_state', 'seller_id', 'month',
    ])
  })
})
