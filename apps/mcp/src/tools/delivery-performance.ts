import { type DeliveryPerformanceInput } from '@olist/contracts'
import { runQuery } from '../db/query-runner.js'
import { buildDateFilter, combineConditions, buildDateAssumptions } from '../analytics/date-filter.js'
import { getDataVersion } from '../analytics/dataset-metadata.js'
import { buildDeliveredReviewedValidDeliveryCohort, getCohortMetadata } from '../analytics/cohort-filter.js'
import type { ToolResponse } from '@olist/contracts'

export const DELIVERY_PERFORMANCE_TOOL = {
  name: 'delivery_performance',
  title: 'Delivery Performance',
  description: `Returns delivery analytics: duration, delay, on-time rate, and geography-based comparisons.
On-time = actual delivery date <= estimated delivery date.
Use for questions about delivery like "Which states have the worst delivery performance?"`,
  inputSchema: {
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    metric: { type: 'string', enum: ['average_delivery_days', 'average_delay_days', 'on_time_rate', 'order_count'], default: 'on_time_rate' },
    group_by: { type: 'string', enum: ['state', 'seller_state', 'seller_id', 'month'], default: 'state' },
    state: { type: 'string', description: 'Filter by state (UF code)' },
    limit: { type: 'number', description: 'Max rows', default: 20 },
    sort: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
  },
}

export async function handleDeliveryPerformance(input: DeliveryPerformanceInput): Promise<ToolResponse> {
  const tool = 'delivery_performance'
  const { metric, group_by, from, to, state, limit, sort, cohort } = input

  const filters: string[] = []
  const params: unknown[] = []
  let paramIdx = 1
  let extraJoin = ''
  const assumptions: string[] = []

  // When cohort is specified, use shared cohort filter for identical eligible-order semantics
  if (cohort === 'delivered_reviewed_valid_delivery') {
    const cohortFilter = buildDeliveredReviewedValidDeliveryCohort({ startParamIndex: paramIdx })
    filters.push(...cohortFilter.conditions)
    extraJoin = cohortFilter.joinClause
    paramIdx = cohortFilter.nextParamIndex
    assumptions.push(...cohortFilter.assumptions)
  } else {
    // Default: delivered orders with valid timestamps
    filters.push(`o.order_status = 'delivered'`)
    filters.push(`o.order_delivered_customer_date IS NOT NULL`)
    filters.push(`o.order_purchase_timestamp IS NOT NULL`)
  }

  // Date filter
  if (from || to) {
    const dateFilter = buildDateFilter(from, to, 'o.order_purchase_timestamp', paramIdx)
    filters.push(...dateFilter.conditions)
    params.push(...dateFilter.params)
    paramIdx = dateFilter.nextParamIndex
  }

  // State filter
  if (state) {
    if (group_by === 'seller_state' || group_by === 'seller_id') {
      filters.push(`os.seller_state = $${paramIdx}`)
    } else {
      filters.push(`c.customer_state = $${paramIdx}`)
    }
    params.push(state)
    paramIdx++
  }

  const whereClause = combineConditions(filters)

  let groupByExpr: string
  let needsSellerJoin = false
  if (group_by === 'seller_state') {
    groupByExpr = 'os.seller_state'
    needsSellerJoin = true
  } else if (group_by === 'seller_id') {
    groupByExpr = 'os.seller_id'
    needsSellerJoin = true
  } else if (group_by === 'month') {
    groupByExpr = "DATE_TRUNC('month', o.order_purchase_timestamp)"
  } else {
    groupByExpr = 'c.customer_state'
  }

  const sellerJoin = needsSellerJoin ? 'JOIN analytics.order_sellers os ON o.order_id = os.order_id' : ''

  let sql: string

  if (metric === 'average_delivery_days') {
    sql = `
      SELECT
        ${groupByExpr} AS group_key,
        AVG(EXTRACT(EPOCH FROM (o.order_delivered_customer_date - o.order_purchase_timestamp)) / 86400) AS metric_value,
        COUNT(DISTINCT o.order_id) AS order_count
      FROM raw.orders o
      JOIN raw.customers c ON o.customer_id = c.customer_id
      ${sellerJoin}
      ${extraJoin}
      ${whereClause}
      GROUP BY ${groupByExpr}
      ORDER BY metric_value ${sort}, ${groupByExpr} ASC
      LIMIT $${paramIdx}
    `
    params.push(limit)
  } else if (metric === 'average_delay_days') {
    sql = `
      SELECT
        ${groupByExpr} AS group_key,
        AVG(EXTRACT(EPOCH FROM (o.order_delivered_customer_date - o.order_estimated_delivery_date)) / 86400) AS metric_value,
        COUNT(DISTINCT o.order_id) AS order_count
      FROM raw.orders o
      JOIN raw.customers c ON o.customer_id = c.customer_id
      ${sellerJoin}
      ${extraJoin}
      ${whereClause}
      GROUP BY ${groupByExpr}
      ORDER BY metric_value ${sort}, ${groupByExpr} ASC
      LIMIT $${paramIdx}
    `
    params.push(limit)
  } else if (metric === 'on_time_rate') {
    sql = `
      SELECT
        ${groupByExpr} AS group_key,
        COUNT(CASE WHEN o.order_delivered_customer_date <= o.order_estimated_delivery_date THEN 1 END)::numeric /
          NULLIF(COUNT(*), 0) AS metric_value,
        COUNT(*) AS order_count
      FROM raw.orders o
      JOIN raw.customers c ON o.customer_id = c.customer_id
      ${sellerJoin}
      ${extraJoin}
      ${whereClause}
      GROUP BY ${groupByExpr}
      ORDER BY metric_value ${sort}, ${groupByExpr} ASC
      LIMIT $${paramIdx}
    `
    params.push(limit)
  } else if (metric === 'order_count') {
    sql = `
      SELECT
        ${groupByExpr} AS group_key,
        COUNT(DISTINCT o.order_id) AS metric_value
      FROM raw.orders o
      JOIN raw.customers c ON o.customer_id = c.customer_id
      ${sellerJoin}
      ${extraJoin}
      ${whereClause}
      GROUP BY ${groupByExpr}
      ORDER BY metric_value ${sort}, ${groupByExpr} ASC
      LIMIT $${paramIdx}
    `
    params.push(limit)
  } else {
    return {
      ok: false,
      tool,
      error: { code: 'UNSUPPORTED_METRIC', message: `Unsupported metric: ${metric}` },
    }
  }

  const result = await runQuery(sql, params, tool)

  if ('code' in result) {
    return {
      ok: false,
      tool,
      error: { code: result.code, message: result.message },
    }
  }

  const dataVersion = await getDataVersion()
  const dateAssumptions = buildDateAssumptions(from, to)
  const allAssumptions = cohort === 'delivered_reviewed_valid_delivery'
    ? [...assumptions, ...dateAssumptions]
    : [
        ...dateAssumptions,
        'Delivery days = actual delivery date - purchase date',
        metric === 'average_delay_days' ? 'Delay = actual delivery date - estimated delivery date; positive = late' : '',
        metric === 'on_time_rate' ? 'On-time = actual delivery date <= estimated delivery date' : '',
        'Filtering to delivered orders with valid timestamps',
      ].filter(Boolean)

  const cohortMeta = cohort === 'delivered_reviewed_valid_delivery' ? getCohortMetadata() : undefined

  return {
    ok: true,
    tool,
    data: result.rows.map((r) => ({
      group_key: r.group_key,
      metric_value: r.metric_value !== null ? Number(r.metric_value) : null,
      order_count: Number(r.order_count),
    })),
    columns: [
      { name: 'group_key', type: 'string' },
      { name: 'metric_value', type: 'number', unit: metric === 'average_delivery_days' ? 'days' : metric === 'average_delay_days' ? 'days' : metric === 'on_time_rate' ? 'percent' : 'count' },
      { name: 'order_count', type: 'number', unit: 'count' },
    ],
    meta: {
      rowCount: result.rows.length,
      grain: `${group_by} × ${metric}`,
      units: {
        metric_value: metric === 'average_delivery_days' || metric === 'average_delay_days' ? 'days' : metric === 'on_time_rate' ? 'percent' : 'count',
        order_count: 'count',
      },
      filters: { from, to, metric, group_by, state, limit, sort },
      ...(cohortMeta ? { cohort: cohortMeta.cohort, assumptions: cohortMeta.assumptions } : { assumptions: allAssumptions }),
      dataVersion,
    },
  }
}
