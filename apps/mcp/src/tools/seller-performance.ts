import { type SellerPerformanceInput } from '@olist/contracts'
import { runQuery } from '../db/query-runner.js'
import { buildDateFilter, combineConditions, buildDateAssumptions } from '../analytics/date-filter.js'
import { getDataVersion } from '../analytics/dataset-metadata.js'
import type { ToolResponse } from '@olist/contracts'

export const SELLER_PERFORMANCE_TOOL = {
  name: 'seller_performance',
  title: 'Seller Performance',
  description: `Returns seller analytics: revenue, order volume, review score, delivery performance, and location.
Use for questions about seller comparisons like "Top 10 sellers by revenue in São Paulo".`,
  inputSchema: {
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    metric: { type: 'string', enum: ['revenue', 'order_count', 'average_review_score', 'average_delivery_days'], default: 'revenue' },
    state: { type: 'string', description: 'Filter by seller state (UF code)' },
    seller_id: { type: 'string', description: 'Filter by specific seller ID' },
    limit: { type: 'number', description: 'Max rows', default: 10 },
    sort: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    status: { type: 'string', description: 'Filter by order status' },
  },
}

const METRIC_QUERIES: Record<string, string> = {
  revenue: `
    SELECT
      s.seller_id,
      s.seller_state,
      s.seller_city,
      SUM(oi.price) AS metric_value,
      COUNT(DISTINCT o.order_id) AS order_count
    FROM raw.orders o
    JOIN raw.order_items oi ON o.order_id = oi.order_id
    JOIN analytics.order_sellers os ON o.order_id = os.order_id
      AND oi.seller_id = os.seller_id
    JOIN raw.sellers s ON os.seller_id = s.seller_id
    {filters}
    GROUP BY s.seller_id, s.seller_state, s.seller_city
    ORDER BY metric_value {sort}, s.seller_id ASC
    LIMIT $1
  `,
  order_count: `
    SELECT
      s.seller_id,
      s.seller_state,
      s.seller_city,
      COUNT(DISTINCT o.order_id) AS metric_value,
      COUNT(DISTINCT o.order_id) AS order_count
    FROM raw.orders o
    JOIN analytics.order_sellers os ON o.order_id = os.order_id
    JOIN raw.sellers s ON os.seller_id = s.seller_id
    {filters}
    GROUP BY s.seller_id, s.seller_state, s.seller_city
    ORDER BY metric_value {sort}, s.seller_id ASC
    LIMIT $1
  `,
  average_review_score: `
    SELECT
      s.seller_id,
      s.seller_state,
      s.seller_city,
      AVG(cr.review_score) AS metric_value,
      COUNT(DISTINCT o.order_id) AS order_count
    FROM raw.orders o
    JOIN analytics.order_sellers os ON o.order_id = os.order_id
    JOIN raw.sellers s ON os.seller_id = s.seller_id
    JOIN analytics.canonical_reviews cr ON o.order_id = cr.order_id
    {filters}
    GROUP BY s.seller_id, s.seller_state, s.seller_city
    ORDER BY metric_value {sort}, s.seller_id ASC
    LIMIT $1
  `,
  average_delivery_days: `
    SELECT
      s.seller_id,
      s.seller_state,
      s.seller_city,
      AVG(EXTRACT(EPOCH FROM (o.order_delivered_customer_date - o.order_purchase_timestamp)) / 86400) AS metric_value,
      COUNT(DISTINCT o.order_id) AS order_count
    FROM raw.orders o
    JOIN analytics.order_sellers os ON o.order_id = os.order_id
    JOIN raw.sellers s ON os.seller_id = s.seller_id
    {filters}
    AND o.order_delivered_customer_date IS NOT NULL
    AND o.order_purchase_timestamp IS NOT NULL
    GROUP BY s.seller_id, s.seller_state, s.seller_city
    ORDER BY metric_value {sort}, s.seller_id ASC
    LIMIT $1
  `,
}

export async function handleSellerPerformance(input: SellerPerformanceInput): Promise<ToolResponse> {
  const tool = 'seller_performance'
  const { metric, from, to, state, seller_id, limit, sort, status } = input

  const sql = METRIC_QUERIES[metric]
  if (!sql) {
    return {
      ok: false,
      tool,
      error: { code: 'UNSUPPORTED_METRIC', message: `Unsupported metric: ${metric}` },
    }
  }

  const filters: string[] = []
  const params: unknown[] = [limit]
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
    filters.push(`s.seller_state = $${paramIdx}`)
    params.push(state)
    paramIdx++
  }

  // Seller ID filter
  if (seller_id) {
    filters.push(`s.seller_id = $${paramIdx}`)
    params.push(seller_id)
    paramIdx++
  }

  const whereClause = combineConditions(filters)
  const finalSql = sql
    .replace('{filters}', whereClause)
    .replace('{sort}', sort)

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
      error: { code: 'EMPTY_RESULT', message: 'No matching sellers were found for the supplied filters.' },
    }
  }

  const dataVersion = await getDataVersion()
  const assumptions = [
    ...buildDateAssumptions(from, to),
    metric === 'revenue' ? 'Revenue = SUM(item.price), excluding freight' : '',
    metric === 'average_review_score' ? 'Using canonical reviews (one per order, deduplicated)' : '',
  ].filter(Boolean)

  return {
    ok: true,
    tool,
    data: result.rows.map((r) => ({
      seller_id: r.seller_id,
      seller_state: r.seller_state,
      seller_city: r.seller_city,
      metric_value: r.metric_value !== null ? Number(r.metric_value) : null,
      order_count: Number(r.order_count),
    })),
    columns: [
      { name: 'seller_id', type: 'string' },
      { name: 'seller_state', type: 'string' },
      { name: 'seller_city', type: 'string' },
      { name: 'metric_value', type: 'number', unit: metric === 'revenue' ? 'BRL' : metric === 'average_review_score' ? 'stars' : metric === 'average_delivery_days' ? 'days' : 'count' },
      { name: 'order_count', type: 'number', unit: 'count' },
    ],
    meta: {
      rowCount: result.rows.length,
      grain: `seller × ${metric}`,
      units: {
        metric_value: metric === 'revenue' ? 'BRL' : metric === 'average_review_score' ? 'stars' : metric === 'average_delivery_days' ? 'days' : 'count',
        order_count: 'count',
      },
      filters: { from, to, metric, state, seller_id, limit, sort, status },
      assumptions,
      dataVersion,
    },
  }
}
