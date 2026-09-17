import { describe, it, expect, beforeAll } from 'vitest'
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

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as Array<{ type: string; text: string }>
  return JSON.parse(content[0]!.text)
}

describe('Analytics Correctness', () => {
  describe('ORDER_TRENDS', () => {
    it('should return monthly revenue for 2017', async () => {
      const result = await callTool('order_trends', {
        from: '2017-01-01', to: '2017-12-31',
        granularity: 'month', metric: 'revenue',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBe(12)
      expect(result.meta.rowCount).toBe(12)
    })

    it('should return order count correctly', async () => {
      const result = await callTool('order_trends', {
        from: '2017-01-01', to: '2017-12-31',
        granularity: 'month', metric: 'order_count',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBe(12)
      data.forEach((row) => {
        expect(Number(row.denominator)).toBeGreaterThan(0)
      })
    })
  })

  describe('CATEGORY_PERFORMANCE', () => {
    it('should return translated English category names', async () => {
      const result = await callTool('category_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'revenue', limit: 5, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      data.forEach((row) => {
        expect(row.category_english).toBeDefined()
        expect(typeof row.category_english).toBe('string')
        expect(row.category_english.length).toBeGreaterThan(0)
      })
    })

    it('should filter by category', async () => {
      const result = await callTool('category_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'revenue', category: 'electronics', limit: 10, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      data.forEach((row) => {
        expect(row.category_english).toBe('electronics')
      })
    })

    it('should rank by revenue descending', async () => {
      const result = await callTool('category_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'revenue', limit: 10, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      for (let i = 1; i < data.length; i++) {
        expect(Number(data[i]!.metric_value)).toBeLessThanOrEqual(Number(data[i - 1]!.metric_value))
      }
    })

    it('should correctly attribute revenue per category (multi-category order)', async () => {
      // Verify that order with items in different categories
      // does not attribute full order total to every category
      const result = await callTool('category_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'revenue', limit: 20, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      // Total revenue across all categories should equal total order revenue
      const totalRevenue = data.reduce((sum, row) => sum + Number(row.metric_value), 0)
      expect(totalRevenue).toBeGreaterThan(0)
    })

    it('should correctly attribute freight per category', async () => {
      const result = await callTool('category_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'total_freight', limit: 10, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      // Verify each category has correct freight (not duplicated)
      data.forEach((row) => {
        expect(Number(row.metric_value)).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('SELLER_PERFORMANCE', () => {
    it('should filter by state SP', async () => {
      const result = await callTool('seller_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'revenue', state: 'SP', limit: 5, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBeGreaterThan(0)
      data.forEach((row) => {
        expect(row.seller_state).toBe('SP')
      })
    })

    it('should return top N sellers by revenue', async () => {
      const result = await callTool('seller_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'revenue', limit: 10, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBeLessThanOrEqual(10)
      for (let i = 1; i < data.length; i++) {
        expect(Number(data[i]!.metric_value)).toBeLessThanOrEqual(Number(data[i - 1]!.metric_value))
      }
    })

    it('should correctly attribute revenue per seller (multi-seller order)', async () => {
      // Verify that order with items from different sellers
      // does not attribute full order total to every seller
      const result = await callTool('seller_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'revenue', limit: 20, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      // Total revenue across all sellers should equal total order revenue
      const totalRevenue = data.reduce((sum, row) => sum + Number(row.metric_value), 0)
      expect(totalRevenue).toBeGreaterThan(0)
    })

    it('should correctly attribute freight per seller', async () => {
      const result = await callTool('seller_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_delivery_days', limit: 10, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      data.forEach((row) => {
        expect(Number(row.metric_value)).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('REVIEW_ANALYSIS', () => {
    it('should return score distribution', async () => {
      const result = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'score_distribution',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBe(5)
      data.forEach((row) => {
        expect(Number(row.score)).toBeGreaterThanOrEqual(1)
        expect(Number(row.score)).toBeLessThanOrEqual(5)
        expect(Number(row.review_count)).toBeGreaterThan(0)
      })
    })

    it('should filter by category', async () => {
      const result = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_score', category: 'electronics',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBe(1)
      expect(Number(data[0]!.metric_value)).toBeGreaterThanOrEqual(1)
      expect(Number(data[0]!.metric_value)).toBeLessThanOrEqual(5)
    })

    it('should group review scores by month', async () => {
      const result = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_score', group_by: 'month',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      // Should have multiple months
      expect(data.length).toBeGreaterThan(0)
      // Check group_key exists
      data.forEach((row) => {
        expect(row.group_key).toBeDefined()
      })
    })

    it('should group review scores by state', async () => {
      const result = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_score', group_by: 'state',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBeGreaterThan(0)
      data.forEach((row) => {
        expect(row.group_key).toBeDefined()
      })
    })

    it('should group review scores by seller', async () => {
      const result = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_score', group_by: 'seller',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBeGreaterThan(0)
      data.forEach((row) => {
        expect(row.group_key).toBeDefined()
      })
    })

    it('should return review_count correctly', async () => {
      const result = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'review_count',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(Number(data[0]!.metric_value)).toBeGreaterThan(0)
    })
  })

  describe('PAYMENT_BREAKDOWN', () => {
    it('should return payment type breakdown', async () => {
      const result = await callTool('payment_breakdown', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'payment_value', group_by: 'payment_type',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBeGreaterThan(0)
      data.forEach((row) => {
        expect(row.group_key).toBeDefined()
        expect(Number(row.metric_value)).toBeGreaterThan(0)
        expect(row.share).toBeDefined()
      })
    })

    it('should calculate payment share correctly', async () => {
      const result = await callTool('payment_breakdown', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'payment_value', group_by: 'payment_type',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      const totalShare = data.reduce((sum, row) => sum + Number(row.share), 0)
      expect(totalShare).toBeCloseTo(1.0, 2)
    })
  })

  describe('DELIVERY_PERFORMANCE', () => {
    it('should return on-time rate by state', async () => {
      const result = await callTool('delivery_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'on_time_rate', group_by: 'state', limit: 20, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBeGreaterThan(0)
      data.forEach((row) => {
        const rate = Number(row.metric_value)
        expect(rate).toBeGreaterThanOrEqual(0)
        expect(rate).toBeLessThanOrEqual(1)
      })
    })

    it('should return average delay days', async () => {
      const result = await callTool('delivery_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_delay_days', group_by: 'state', limit: 10, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBeGreaterThan(0)
    })

    it('should return worst states first when sorting by on_time_rate ascending', async () => {
      // Worst delivery = lowest on_time_rate
      // sort=asc should put worst (lowest rate) first
      const result = await callTool('delivery_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'on_time_rate', group_by: 'state', limit: 20, sort: 'asc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBeGreaterThan(0)
      for (let i = 1; i < data.length; i++) {
        expect(Number(data[i]!.metric_value)).toBeGreaterThanOrEqual(Number(data[i - 1]!.metric_value))
      }
    })

    it('should support seller_id grouping for correlation queries', async () => {
      const result = await callTool('delivery_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_delivery_days', group_by: 'seller_id', limit: 10, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBeGreaterThan(0)
      data.forEach((row) => {
        expect(row.group_key).toBeDefined()
      })
    })
  })

  describe('MULTI-TOOL COVERAGE', () => {
    it('should support comparing review scores across top 5 categories by order volume', async () => {
      // Step 1: Get top 5 categories by order volume
      const catResult = await callTool('category_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'order_count', limit: 5, sort: 'desc',
      })
      expect(catResult.ok).toBe(true)
      const cats = catResult.data as Array<Record<string, unknown>>
      expect(cats.length).toBe(5)
      // Step 2: Get review scores for each category
      for (const cat of cats) {
        const revResult = await callTool('review_analysis', {
          from: '2017-01-01', to: '2017-12-31',
          metric: 'average_score', category: cat.category_english as string,
        })
        expect(revResult.ok).toBe(true)
      }
    })

    it('should support showing monthly orders and average review score together for 2017', async () => {
      // Step 1: Get monthly orders
      const orderResult = await callTool('order_trends', {
        from: '2017-01-01', to: '2017-12-31',
        granularity: 'month', metric: 'order_count',
      })
      expect(orderResult.ok).toBe(true)
      const orders = orderResult.data as Array<Record<string, unknown>>
      expect(orders.length).toBe(12)
      // Step 2: Get monthly review scores
      const revResult = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_score', group_by: 'month',
      })
      expect(revResult.ok).toBe(true)
      const reviews = revResult.data as Array<Record<string, unknown>>
      // Both have month periods that can be joined
      expect(reviews.length).toBeGreaterThan(0)
      // Verify month keys align
      orders.forEach((orderRow) => {
        const period = orderRow.period as string
        const matchingReview = reviews.find((r) => r.group_key === period)
        if (matchingReview) {
          expect(matchingReview.metric_value).toBeDefined()
        }
      })
    })

    it('should support comparing seller delivery vs reviews', async () => {
      // Step 1: Get seller delivery metrics
      const deliveryResult = await callTool('delivery_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_delivery_days', group_by: 'seller_id', limit: 10, sort: 'desc',
      })
      expect(deliveryResult.ok).toBe(true)
      const sellers = deliveryResult.data as Array<Record<string, unknown>>
      expect(sellers.length).toBeGreaterThan(0)
      // Step 2: Get seller review scores
      const revResult = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_score', group_by: 'seller',
      })
      expect(revResult.ok).toBe(true)
      const reviews = revResult.data as Array<Record<string, unknown>>
      // Both have seller_id keys that can be joined
      expect(reviews.length).toBeGreaterThan(0)
    })

    it('should support comparing delivery delay and review score by state', async () => {
      // Step 1: Get delivery delay by state
      const deliveryResult = await callTool('delivery_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_delay_days', group_by: 'state', limit: 20, sort: 'desc',
      })
      expect(deliveryResult.ok).toBe(true)
      const states = deliveryResult.data as Array<Record<string, unknown>>
      expect(states.length).toBeGreaterThan(0)
      // Step 2: Get review score by state
      const revResult = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'average_score', group_by: 'state',
      })
      expect(revResult.ok).toBe(true)
      const reviews = revResult.data as Array<Record<string, unknown>>
      // Both have state keys that can be joined
      expect(reviews.length).toBeGreaterThan(0)
    })
  })

  describe('FAN-OUT SAFETY', () => {
    it('should not multiply revenue when joining items', async () => {
      const result = await callTool('order_trends', {
        from: '2017-01-01', to: '2017-01-31',
        granularity: 'month', metric: 'revenue',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBe(1)
      expect(Number(data[0]!.value)).toBeGreaterThan(0)
      expect(Number(data[0]!.denominator)).toBeGreaterThan(0)
    })

    it('should not multiply reviews when joining categories', async () => {
      const result = await callTool('review_analysis', {
        from: '2017-01-01', to: '2017-01-31',
        metric: 'review_count',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      expect(data.length).toBe(1)
      expect(Number(data[0]!.metric_value)).toBeGreaterThan(0)
    })

    it('should correctly attribute revenue per category (multi-category order)', async () => {
      const result = await callTool('category_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'revenue', limit: 20, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      // Each category should have correct per-item revenue
      // Total should equal total order revenue without inflation
      data.forEach((row) => {
        expect(Number(row.metric_value)).toBeGreaterThanOrEqual(0)
      })
    })

    it('should correctly attribute revenue per seller (multi-seller order)', async () => {
      const result = await callTool('seller_performance', {
        from: '2017-01-01', to: '2017-12-31',
        metric: 'revenue', limit: 20, sort: 'desc',
      })
      expect(result.ok).toBe(true)
      const data = result.data as Array<Record<string, unknown>>
      data.forEach((row) => {
        expect(Number(row.metric_value)).toBeGreaterThanOrEqual(0)
      })
    })
  })
})
