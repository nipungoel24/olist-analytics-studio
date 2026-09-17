import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'
import { closePool } from './db/pool.js'
import { handleDatasetMetadata } from './tools/dataset-metadata.js'
import { handleOrderTrends } from './tools/order-trends.js'
import { handleCategoryPerformance } from './tools/category-performance.js'
import { handleSellerPerformance } from './tools/seller-performance.js'
import { handleReviewAnalysis } from './tools/review-analysis.js'
import { handlePaymentBreakdown } from './tools/payment-breakdown.js'
import { handleDeliveryPerformance } from './tools/delivery-performance.js'
import type { ToolResponse } from '@olist/contracts'

function log(msg: string) {
  process.stderr.write(`[mcp] ${msg}\n`)
}

const BRAZILIAN_STATES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const
const ORDER_STATUSES = ['delivered', 'shipped', 'processing', 'invoiced', 'canceled', 'unavailable', 'approved', 'created'] as const
const SORT_ORDERS = ['asc', 'desc'] as const

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Expected YYYY-MM-DD')

// Use passthrough schemas — handler-level validation provides structured errors
const DatasetMetadataInputSchema = z.object({}).passthrough()

const OrderTrendsInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  granularity: z.enum(['day', 'week', 'month', 'quarter', 'year']).default('month'),
  metric: z.enum(['revenue', 'order_count', 'average_delivery_days', 'on_time_rate']).default('revenue'),
  status: z.enum(ORDER_STATUSES).optional(),
  state: z.enum(BRAZILIAN_STATES).optional(),
}).passthrough()

const CategoryPerformanceInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(['revenue', 'order_count', 'average_review_score', 'total_freight', 'item_count']).default('revenue'),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10),
  sort: z.enum(SORT_ORDERS).default('desc'),
  status: z.enum(ORDER_STATUSES).optional(),
}).passthrough()

const SellerPerformanceInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(['revenue', 'order_count', 'average_review_score', 'average_delivery_days']).default('revenue'),
  state: z.enum(BRAZILIAN_STATES).optional(),
  seller_id: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10),
  sort: z.enum(SORT_ORDERS).default('desc'),
  status: z.enum(ORDER_STATUSES).optional(),
}).passthrough()

const ReviewAnalysisInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(['score_distribution', 'average_score', 'review_count', 'average_response_days']).default('score_distribution'),
  group_by: z.enum(['none', 'month', 'state', 'seller']).default('none'),
  category: z.string().optional(),
  state: z.enum(BRAZILIAN_STATES).optional(),
  score: z.number().int().min(1).max(5).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
}).passthrough()

const PaymentBreakdownInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(['payment_value', 'payment_count', 'order_count', 'average_installments']).default('payment_value'),
  payment_type: z.enum(['credit_card', 'boleto', 'voucher', 'debit_card']).optional(),
  group_by: z.enum(['payment_type', 'installments', 'month']).default('payment_type'),
}).passthrough()

const DeliveryPerformanceInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(['average_delivery_days', 'average_delay_days', 'on_time_rate', 'order_count']).default('on_time_rate'),
  group_by: z.enum(['state', 'seller_state', 'seller_id', 'month']).default('state'),
  state: z.enum(BRAZILIAN_STATES).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  sort: z.enum(SORT_ORDERS).default('desc'),
}).passthrough()

function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): { ok: true; data: T } | { ok: false; error: ToolResponse } {
  const result = schema.safeParse(input)
  if (result.success) {
    return { ok: true, data: result.data }
  }
  const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
  return {
    ok: false,
    error: {
      ok: false,
      tool: 'unknown',
      error: {
        code: 'INVALID_INPUT',
        message: `Input validation failed: ${issues}`,
      },
    },
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.message) return err.message
    const agg = err as Error & { errors?: unknown[] }
    if (Array.isArray(agg.errors) && agg.errors.length > 0) {
      return agg.errors
        .map((e) => (e instanceof Error && e.message ? e.message : String(e)))
        .join('; ')
    }
    return err.constructor.name
  }
  return String(err)
}

function wrapHandler<T>(
  schema: z.ZodSchema<T>,
  handler: (input: T) => Promise<ToolResponse>,
  toolName: string
): (input: unknown) => Promise<ToolResponse> {
  return async (input: unknown) => {
    const validation = validateInput(schema, input)
    if (!validation.ok) {
      return { ...validation.error, tool: toolName }
    }
    try {
      return await handler(validation.data)
    } catch (err) {
      const msg = errorMessage(err)
      log(`Tool error: ${msg}`)
      return {
        ok: false,
        tool: toolName,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Internal error: ${msg}`,
        },
      }
    }
  }
}

function formatResponse(response: ToolResponse): { content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown> } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
    structuredContent: response as unknown as Record<string, unknown>,
  }
}

function createServer(): McpServer {
  const server = new McpServer(
    { name: 'olist-analytics', version: '0.2.0' },
    { capabilities: { tools: {} } }
  )

  server.registerTool(
    'dataset_metadata',
    {
      title: 'Dataset Metadata',
      description: `Returns metadata about the active Olist e-commerce dataset.
Includes date range, supported product categories, supported Brazilian states, data version, and row counts.
Use this tool to discover what data is available before running analytical queries.`,
      inputSchema: DatasetMetadataInputSchema,
    },
    async (input) => {
      const response = await wrapHandler(DatasetMetadataInputSchema, handleDatasetMetadata as (input: Record<string, unknown>) => Promise<ToolResponse>, 'dataset_metadata')(input)
      return formatResponse(response)
    }
  )

  server.registerTool(
    'order_trends',
    {
      title: 'Order Trends',
      description: `Returns order volume, revenue, delivery performance, and other metrics aggregated over time.
Supports monthly, quarterly, yearly granularity.
Use for questions about trends over time like "Show monthly revenue trend for 2017".`,
      inputSchema: OrderTrendsInputSchema,
    },
    async (input) => {
      const response = await wrapHandler(OrderTrendsInputSchema, handleOrderTrends, 'order_trends')(input)
      return formatResponse(response)
    }
  )

  server.registerTool(
    'category_performance',
    {
      title: 'Category Performance',
      description: `Returns product category analytics: revenue, order volume, review score, freight, and rankings.
All results use English category names.
Use for questions about category comparisons like "Which product categories generate the most revenue?"`,
      inputSchema: CategoryPerformanceInputSchema,
    },
    async (input) => {
      const response = await wrapHandler(CategoryPerformanceInputSchema, handleCategoryPerformance, 'category_performance')(input)
      return formatResponse(response)
    }
  )

  server.registerTool(
    'seller_performance',
    {
      title: 'Seller Performance',
      description: `Returns seller analytics: revenue, order volume, review score, delivery performance, and location.
Use for questions about seller comparisons like "Top 10 sellers by revenue in São Paulo".`,
      inputSchema: SellerPerformanceInputSchema,
    },
    async (input) => {
      const response = await wrapHandler(SellerPerformanceInputSchema, handleSellerPerformance, 'seller_performance')(input)
      return formatResponse(response)
    }
  )

  server.registerTool(
    'review_analysis',
    {
      title: 'Review Analysis',
      description: `Returns review analytics: score distribution, average score, counts, and response timing.
Uses canonical reviews (one per order, deduplicated by latest answer timestamp).
Supports grouping by month, state, or seller for multi-tool correlation queries.`,
      inputSchema: ReviewAnalysisInputSchema,
    },
    async (input) => {
      const response = await wrapHandler(ReviewAnalysisInputSchema, handleReviewAnalysis, 'review_analysis')(input)
      return formatResponse(response)
    }
  )

  server.registerTool(
    'payment_breakdown',
    {
      title: 'Payment Breakdown',
      description: `Returns payment analytics by type, installments, or time period.
Includes payment value, count, and share metrics.
Use for questions about payment composition like "What share of payments are credit card vs boleto?"`,
      inputSchema: PaymentBreakdownInputSchema,
    },
    async (input) => {
      const response = await wrapHandler(PaymentBreakdownInputSchema, handlePaymentBreakdown, 'payment_breakdown')(input)
      return formatResponse(response)
    }
  )

  server.registerTool(
    'delivery_performance',
    {
      title: 'Delivery Performance',
      description: `Returns delivery analytics: duration, delay, on-time rate, and geography-based comparisons.
On-time = actual delivery date <= estimated delivery date.
Use for questions about delivery like "Which states have the worst delivery performance?"`,
      inputSchema: DeliveryPerformanceInputSchema,
    },
    async (input) => {
      const response = await wrapHandler(DeliveryPerformanceInputSchema, handleDeliveryPerformance, 'delivery_performance')(input)
      return formatResponse(response)
    }
  )

  log('Registered 7 tools')
  return server
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  log('Received SIGTERM, closing database pool')
  await closePool()
  process.exit(0)
})

process.on('SIGINT', async () => {
  log('Received SIGINT, closing database pool')
  await closePool()
  process.exit(0)
})

serveStdio(createServer)
