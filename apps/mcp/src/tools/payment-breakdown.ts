import { type PaymentBreakdownInput } from '@olist/contracts'
import { runQuery } from '../db/query-runner.js'
import { buildDateFilter, combineConditions, buildDateAssumptions } from '../analytics/date-filter.js'
import { getDataVersion } from '../analytics/dataset-metadata.js'
import type { ToolResponse } from '@olist/contracts'

export const PAYMENT_BREAKDOWN_TOOL = {
  name: 'payment_breakdown',
  title: 'Payment Breakdown',
  description: `Returns payment analytics by type, installments, or time period.
Includes payment value, count, and share metrics.
Use for questions about payment composition like "What share of payments are credit card vs boleto?"`,
  inputSchema: {
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    metric: { type: 'string', enum: ['payment_value', 'payment_count', 'order_count', 'average_installments'], default: 'payment_value' },
    payment_type: { type: 'string', description: 'Filter by payment type' },
    group_by: { type: 'string', enum: ['payment_type', 'installments', 'month'], default: 'payment_type' },
  },
}

export async function handlePaymentBreakdown(input: PaymentBreakdownInput): Promise<ToolResponse> {
  const tool = 'payment_breakdown'
  const { metric, from, to, payment_type, group_by } = input

  const filters: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  // Date filter
  if (from || to) {
    const dateFilter = buildDateFilter(from, to, 'o.order_purchase_timestamp', paramIdx)
    filters.push(...dateFilter.conditions)
    params.push(...dateFilter.params)
    paramIdx = dateFilter.nextParamIndex
  }

  // Payment type filter
  if (payment_type) {
    filters.push(`op.payment_type = $${paramIdx}`)
    params.push(payment_type)
    paramIdx++
  }

  const whereClause = combineConditions(filters)

  let sql: string
  let groupByClause: string

  if (group_by === 'payment_type') {
    groupByClause = 'op.payment_type'
  } else if (group_by === 'installments') {
    groupByClause = 'op.payment_installments'
  } else {
    groupByClause = "DATE_TRUNC('month', o.order_purchase_timestamp)"
  }

  if (metric === 'payment_value') {
    sql = `
      SELECT
        ${groupByClause} AS group_key,
        SUM(op.payment_value) AS metric_value,
        COUNT(*) AS payment_count,
        COUNT(DISTINCT o.order_id) AS order_count,
        SUM(SUM(op.payment_value)) OVER () AS total_value
      FROM raw.orders o
      JOIN raw.order_payments op ON o.order_id = op.order_id
      ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY metric_value DESC, ${groupByClause} ASC
    `
  } else if (metric === 'payment_count') {
    sql = `
      SELECT
        ${groupByClause} AS group_key,
        COUNT(*) AS metric_value,
        COUNT(DISTINCT o.order_id) AS order_count
      FROM raw.orders o
      JOIN raw.order_payments op ON o.order_id = op.order_id
      ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY metric_value DESC, ${groupByClause} ASC
    `
  } else if (metric === 'order_count') {
    sql = `
      SELECT
        ${groupByClause} AS group_key,
        COUNT(DISTINCT o.order_id) AS metric_value,
        COUNT(*) AS payment_count
      FROM raw.orders o
      JOIN raw.order_payments op ON o.order_id = op.order_id
      ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY metric_value DESC, ${groupByClause} ASC
    `
  } else if (metric === 'average_installments') {
    sql = `
      SELECT
        ${groupByClause} AS group_key,
        AVG(op.payment_installments) AS metric_value,
        COUNT(*) AS payment_count,
        COUNT(DISTINCT o.order_id) AS order_count
      FROM raw.orders o
      JOIN raw.order_payments op ON o.order_id = op.order_id
      ${whereClause}
      GROUP BY ${groupByClause}
      ORDER BY metric_value DESC, ${groupByClause} ASC
    `
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
  const assumptions = [
    ...buildDateAssumptions(from, to),
    'Payment share = SUM(payment_value) for that type / SUM(all payment_value)',
    'Mixed payment orders can contribute to multiple types',
  ]

  // Add share calculation for payment_value
  const data = result.rows.map((r) => {
    const row: Record<string, unknown> = {
      group_key: r.group_key,
      metric_value: r.metric_value !== null ? Number(r.metric_value) : null,
      payment_count: Number(r.payment_count),
      order_count: Number(r.order_count),
    }

    if (metric === 'payment_value' && r.total_value) {
      row.share = Number(r.metric_value) / Number(r.total_value)
    }

    return row
  })

  return {
    ok: true,
    tool,
    data,
    columns: [
      { name: 'group_key', type: 'string' },
      { name: 'metric_value', type: 'number', unit: metric === 'payment_value' ? 'BRL' : metric === 'average_installments' ? 'count' : 'count' },
      { name: 'payment_count', type: 'number', unit: 'count' },
      { name: 'order_count', type: 'number', unit: 'count' },
      ...(metric === 'payment_value' ? [{ name: 'share', type: 'number', unit: 'percent' }] : []),
    ],
    meta: {
      rowCount: result.rows.length,
      grain: `${group_by} × ${metric}`,
      units: {
        metric_value: metric === 'payment_value' ? 'BRL' : metric === 'average_installments' ? 'count' : 'count',
        payment_count: 'count',
        order_count: 'count',
      },
      filters: { from, to, metric, payment_type, group_by },
      assumptions,
      dataVersion,
    },
  }
}
