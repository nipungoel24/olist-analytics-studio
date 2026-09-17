import { type OrderTrendsInput } from '@olist/contracts'
import { runQuery } from '../db/query-runner.js'
import { buildDateFilter, combineConditions, buildDateAssumptions } from '../analytics/date-filter.js'
import { getDataVersion } from '../analytics/dataset-metadata.js'
import type { ToolResponse } from '@olist/contracts'

export const ORDER_TRENDS_TOOL = {
  name: 'order_trends',
  title: 'Order Trends',
  description: `Returns order volume, revenue, delivery performance, and other metrics aggregated over time.
Supports monthly, quarterly, yearly granularity.
Use for questions about trends over time like "Show monthly revenue trend for 2017".`,
  inputSchema: {
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    granularity: { type: 'string', enum: ['month', 'quarter', 'year'], default: 'month' },
    metric: { type: 'string', enum: ['revenue', 'order_count', 'average_delivery_days', 'on_time_rate'], default: 'revenue' },
    status: { type: 'string', description: 'Filter by order status' },
    state: { type: 'string', description: 'Filter by customer state (UF code)' },
  },
}

const METRIC_QUERIES: Record<string, string> = {
  revenue: `
    SELECT
      DATE_TRUNC($1, o.order_purchase_timestamp) AS period,
      SUM(iob.merchandise_total) AS value,
      COUNT(DISTINCT o.order_id) AS denominator
    FROM raw.orders o
    JOIN analytics.items_by_order iob ON o.order_id = iob.order_id
    {filters}
    GROUP BY DATE_TRUNC($1, o.order_purchase_timestamp)
    ORDER BY period ASC
  `,
  order_count: `
    SELECT
      DATE_TRUNC($1, o.order_purchase_timestamp) AS period,
      COUNT(DISTINCT o.order_id) AS value,
      COUNT(DISTINCT o.order_id) AS denominator
    FROM raw.orders o
    {filters}
    GROUP BY DATE_TRUNC($1, o.order_purchase_timestamp)
    ORDER BY period ASC
  `,
  average_delivery_days: `
    SELECT
      DATE_TRUNC($1, o.order_purchase_timestamp) AS period,
      AVG(EXTRACT(EPOCH FROM (o.order_delivered_customer_date - o.order_purchase_timestamp)) / 86400) AS value,
      COUNT(DISTINCT o.order_id) AS denominator
    FROM raw.orders o
    {filters}
    AND o.order_delivered_customer_date IS NOT NULL
    AND o.order_purchase_timestamp IS NOT NULL
    GROUP BY DATE_TRUNC($1, o.order_purchase_timestamp)
    ORDER BY period ASC
  `,
  on_time_rate: `
    SELECT
      DATE_TRUNC($1, o.order_purchase_timestamp) AS period,
      COUNT(CASE WHEN o.order_delivered_customer_date <= o.order_estimated_delivery_date THEN 1 END)::numeric /
        NULLIF(COUNT(CASE WHEN o.order_delivered_customer_date IS NOT NULL THEN 1 END), 0) AS value,
      COUNT(CASE WHEN o.order_delivered_customer_date IS NOT NULL THEN 1 END) AS denominator
    FROM raw.orders o
    {filters}
    AND o.order_delivered_customer_date IS NOT NULL
    AND o.order_estimated_delivery_date IS NOT NULL
    GROUP BY DATE_TRUNC($1, o.order_purchase_timestamp)
    ORDER BY period ASC
  `,
}

export async function handleOrderTrends(input: OrderTrendsInput): Promise<ToolResponse> {
  const tool = 'order_trends'
  const { metric, granularity, from, to, status, state } = input

  // Validate date range
  if (from && to && new Date(from) > new Date(to)) {
    return {
      ok: false,
      tool,
      error: { code: 'INVALID_DATE_RANGE', message: `From date (${from}) must be <= to date (${to})` },
    }
  }

  const sql = METRIC_QUERIES[metric]
  if (!sql) {
    return {
      ok: false,
      tool,
      error: { code: 'UNSUPPORTED_METRIC', message: `Unsupported metric: ${metric}` },
    }
  }

  const filters: string[] = []
  const params: unknown[] = [granularity]
  let paramIdx = 2

  // Default to delivered orders for revenue
  if (metric === 'revenue') {
    filters.push(`o.order_status = 'delivered'`)
  }

  // Date filter
  if (from || to) {
    const dateFilter = buildDateFilter(from, to, 'o.order_purchase_timestamp', paramIdx)
    filters.push(...dateFilter.conditions)
    params.push(...dateFilter.params)
    paramIdx = dateFilter.nextParamIndex
  }

  // Status filter
  if (status) {
    filters.push(`o.order_status = $${paramIdx}`)
    params.push(status)
    paramIdx++
  }

  // State filter
  if (state) {
    filters.push(`o.customer_id IN (SELECT customer_id FROM raw.customers WHERE customer_state = $${paramIdx})`)
    params.push(state)
    paramIdx++
  }

  const whereClause = combineConditions(filters)
  const finalSql = sql.replace('{filters}', whereClause)

  const result = await runQuery(finalSql, params, tool)

  if ('code' in result) {
    return {
      ok: false,
      tool,
      error: { code: result.code, message: result.message },
    }
  }

  if (result.rows.length === 0) {
    return {
      ok: false,
      tool,
      error: { code: 'EMPTY_RESULT', message: 'No matching orders were found for the supplied filters.' },
    }
  }

  const dataVersion = await getDataVersion()
  const assumptions = [
    ...buildDateAssumptions(from, to),
    metric === 'revenue' ? 'Revenue = SUM(item.price), excluding freight' : '',
    metric === 'revenue' ? 'Filtering to delivered orders only' : '',
    metric === 'on_time_rate' ? 'On-time = actual delivery date <= estimated delivery date' : '',
  ].filter(Boolean)

  return {
    ok: true,
    tool,
    data: result.rows.map((r) => ({
      period: r.period,
      value: r.value !== null ? Number(r.value) : null,
      denominator: Number(r.denominator),
    })),
    columns: [
      { name: 'period', type: 'timestamp', unit: 'period' },
      { name: 'value', type: 'number', unit: metric === 'revenue' ? 'BRL' : metric === 'on_time_rate' ? 'percent' : metric === 'average_delivery_days' ? 'days' : 'count' },
      { name: 'denominator', type: 'number', unit: 'count' },
    ],
    meta: {
      rowCount: result.rows.length,
      grain: `${granularity} × ${metric}`,
      units: {
        value: metric === 'revenue' ? 'BRL' : metric === 'on_time_rate' ? 'percent' : metric === 'average_delivery_days' ? 'days' : 'count',
        denominator: 'count',
      },
      filters: { from, to, granularity, metric, status, state },
      assumptions,
      dataVersion,
    },
  }
}
