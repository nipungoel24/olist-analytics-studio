import type Anthropic from '@anthropic-ai/sdk'

// Tool schema translation: MCP registered tool definitions → Anthropic provider
// tool definitions. The MCP server defines tools with Zod schemas; this module
// converts them to Anthropic's JSON Schema tool format so the provider sees
// exactly the same parameters as the MCP server enforces.

export interface McpToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const MCP_TOOL_DEFINITIONS: McpToolDef[] = [
  {
    name: 'dataset_metadata',
    description: 'Returns metadata about the active Olist e-commerce dataset. Includes date range, supported product categories, supported Brazilian states, data version, and row counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'order_trends',
    description: 'Returns order volume, revenue, delivery performance, and other metrics aggregated over time. Supports monthly, quarterly, yearly granularity. Use for questions about trends over time.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date (YYYY-MM-DD). Optional.' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD). Optional.' },
        granularity: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'], description: 'Time granularity.' },
        metric: { type: 'string', enum: ['revenue', 'order_count', 'average_delivery_days', 'on_time_rate'], description: 'Metric to compute.' },
        status: { type: 'string', description: 'Filter by order status.' },
        state: { type: 'string', description: 'Filter by Brazilian state code.' },
      },
    },
  },
  {
    name: 'category_performance',
    description: 'Returns product category analytics: revenue, order volume, review score, freight, and rankings. All results use English category names. Use for category comparison questions.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date (YYYY-MM-DD). Optional.' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD). Optional.' },
        metric: { type: 'string', enum: ['revenue', 'order_count', 'average_review_score', 'total_freight', 'item_count'], description: 'Metric to compute.' },
        category: { type: 'string', description: 'Filter to a specific category.' },
        limit: { type: 'number', description: 'Max results (1-100).' },
        sort: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction.' },
        status: { type: 'string', description: 'Filter by order status.' },
      },
    },
  },
  {
    name: 'seller_performance',
    description: 'Returns seller analytics: revenue, order volume, review score, delivery performance, and location. Use for seller comparison questions.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date (YYYY-MM-DD). Optional.' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD). Optional.' },
        metric: { type: 'string', enum: ['revenue', 'order_count', 'average_review_score', 'average_delivery_days'], description: 'Metric to compute.' },
        state: { type: 'string', description: 'Filter by Brazilian state code.' },
        seller_id: { type: 'string', description: 'Filter to a specific seller.' },
        limit: { type: 'number', description: 'Max results (1-100).' },
        sort: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction.' },
        status: { type: 'string', description: 'Filter by order status.' },
      },
    },
  },
  {
    name: 'review_analysis',
    description: 'Returns review analytics: score distribution, average score, counts, and response timing. Uses canonical reviews (one per order, deduplicated). Supports grouping by month, state, or seller.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date (YYYY-MM-DD). Optional.' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD). Optional.' },
        metric: { type: 'string', enum: ['score_distribution', 'average_score', 'review_count', 'average_response_days'], description: 'Metric to compute.' },
        group_by: { type: 'string', enum: ['none', 'month', 'state', 'seller'], description: 'Group results by dimension.' },
        category: { type: 'string', description: 'Filter to a specific category.' },
        state: { type: 'string', description: 'Filter by Brazilian state code.' },
        score: { type: 'number', description: 'Filter to a specific score (1-5).' },
        status: { type: 'string', description: 'Filter by order status.' },
      },
    },
  },
  {
    name: 'payment_breakdown',
    description: 'Returns payment analytics by type, installments, or time period. Includes payment value, count, and share metrics. Use for payment composition questions.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date (YYYY-MM-DD). Optional.' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD). Optional.' },
        metric: { type: 'string', enum: ['payment_value', 'payment_count', 'order_count', 'average_installments'], description: 'Metric to compute.' },
        payment_type: { type: 'string', description: 'Filter by payment type.' },
        group_by: { type: 'string', enum: ['payment_type', 'installments', 'month'], description: 'Group results by dimension.' },
      },
    },
  },
  {
    name: 'delivery_performance',
    description: 'Returns delivery analytics: duration, delay, on-time rate, and geography-based comparisons. On-time = actual delivery date <= estimated delivery date. Use for delivery comparison questions.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date (YYYY-MM-DD). Optional.' },
        to: { type: 'string', description: 'End date (YYYY-MM-DD). Optional.' },
        metric: { type: 'string', enum: ['average_delivery_days', 'average_delay_days', 'on_time_rate', 'order_count'], description: 'Metric to compute.' },
        group_by: { type: 'string', enum: ['state', 'seller_state', 'seller_id', 'month'], description: 'Group results by dimension.' },
        state: { type: 'string', description: 'Filter by Brazilian state code.' },
        limit: { type: 'number', description: 'Max results (1-100).' },
        sort: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction.' },
      },
    },
  },
]

export function getProviderToolDefinitions(): Anthropic.Tool[] {
  return MCP_TOOL_DEFINITIONS.map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: def.inputSchema as Anthropic.Tool.InputSchema,
  }))
}

export function getProviderToolNames(): string[] {
  return MCP_TOOL_DEFINITIONS.map((def) => def.name)
}
