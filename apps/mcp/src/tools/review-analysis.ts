import { type ReviewAnalysisInput } from '@olist/contracts'
import { runQuery } from '../db/query-runner.js'
import { buildDateFilter, combineConditions, buildDateAssumptions } from '../analytics/date-filter.js'
import { getCategoryFilter } from '../analytics/category-resolution.js'
import { getDataVersion } from '../analytics/dataset-metadata.js'
import { buildDeliveredReviewedValidDeliveryCohort, getCohortMetadata } from '../analytics/cohort-filter.js'
import type { ToolResponse } from '@olist/contracts'

export const REVIEW_ANALYSIS_TOOL = {
  name: 'review_analysis',
  title: 'Review Analysis',
  description: `Returns review analytics: score distribution, average score, counts, and response timing.
Uses canonical reviews (one per order, deduplicated by latest answer timestamp).
Supports grouping by month, state, or seller for multi-tool correlation queries.`,
  inputSchema: {
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    metric: { type: 'string', enum: ['score_distribution', 'average_score', 'review_count', 'average_response_days'], default: 'score_distribution' },
    group_by: { type: 'string', enum: ['none', 'month', 'state', 'seller'], default: 'none' },
    category: { type: 'string', description: 'Filter by English category name' },
    state: { type: 'string', description: 'Filter by customer state (UF code)' },
    score: { type: 'number', description: 'Filter by specific score (1-5)' },
    status: { type: 'string', description: 'Filter by order status (for common-cohort comparisons)' },
  },
}

export async function handleReviewAnalysis(input: ReviewAnalysisInput): Promise<ToolResponse> {
  const tool = 'review_analysis'
  const { metric, from, to, category, state, score, status, group_by, cohort } = input

  let sql: string
  let params: unknown[] = []
  let paramIdx = 1

  const filters: string[] = []
  const assumptions: string[] = []

  // When cohort is specified, use shared cohort filter for identical eligible-order semantics
  if (cohort === 'delivered_reviewed_valid_delivery') {
    const cohortFilter = buildDeliveredReviewedValidDeliveryCohort({
      startParamIndex: paramIdx,
      alreadyJoinedCanonicalReviews: true,
    })
    filters.push(...cohortFilter.conditions)
    paramIdx = cohortFilter.nextParamIndex
    assumptions.push(...cohortFilter.assumptions)
  }

  // Date filter
  if (from || to) {
    const dateFilter = buildDateFilter(from, to, 'o.order_purchase_timestamp', paramIdx)
    filters.push(...dateFilter.conditions)
    params.push(...dateFilter.params)
    paramIdx = dateFilter.nextParamIndex
  }

  // Category filter
  if (category) {
    const catFilter = await getCategoryFilter(category, paramIdx)
    if (!catFilter || 'error' in catFilter) {
      return {
        ok: false,
        tool,
        error: { code: 'UNKNOWN_CATEGORY', message: `Unknown category: "${category}". Use dataset_metadata to list available categories.` },
      }
    }
    filters.push(catFilter.condition)
    params.push(...catFilter.params)
    paramIdx = catFilter.nextParamIndex
    assumptions.push(...catFilter.assumptions)
  }

  // State filter
  if (state) {
    filters.push(`c.customer_state = $${paramIdx}`)
    params.push(state)
    paramIdx++
  }

  // Score filter
  if (score) {
    filters.push(`cr.review_score = $${paramIdx}`)
    params.push(score)
    paramIdx++
  }

  // Status filter (used for common-cohort multi-tool comparisons)
  if (status) {
    filters.push(`o.order_status = $${paramIdx}`)
    params.push(status)
    paramIdx++
  }

  const whereClause = combineConditions(filters)

  // Determine group-by expression
  let groupByExpr: string | null = null
  let groupByLabel: string = 'none'
  if (group_by === 'month') {
    groupByExpr = "DATE_TRUNC('month', o.order_purchase_timestamp)"
    groupByLabel = 'month'
  } else if (group_by === 'state') {
    groupByExpr = 'c.customer_state'
    groupByLabel = 'state'
  } else if (group_by === 'seller') {
    groupByExpr = 'os.seller_id'
    groupByLabel = 'seller'
  }

  const needsSellerJoin = group_by === 'seller'
  const sellerJoin = needsSellerJoin ? 'JOIN analytics.order_sellers os ON o.order_id = os.order_id' : ''

  const groupByClause = groupByExpr ? `GROUP BY ${groupByExpr}` : ''
  const orderByGroup = groupByExpr ? `${groupByExpr}, ` : ''

  if (metric === 'score_distribution') {
    sql = `
      SELECT
        ${groupByExpr ? `${groupByExpr} AS group_key,` : ''}
        cr.review_score AS score,
        COUNT(*) AS review_count,
        COUNT(DISTINCT o.order_id) AS order_count
      FROM raw.orders o
      JOIN analytics.canonical_reviews cr ON o.order_id = cr.order_id
      JOIN raw.customers c ON o.customer_id = c.customer_id
      ${needsSellerJoin ? sellerJoin : ''}
      ${category ? 'JOIN analytics.order_categories oc ON o.order_id = oc.order_id' : ''}
      ${whereClause}
      GROUP BY ${orderByGroup}cr.review_score
      ORDER BY ${orderByGroup}cr.review_score ASC
    `
  } else if (metric === 'average_score') {
    sql = `
      SELECT
        ${groupByExpr ? `${groupByExpr} AS group_key,` : ''}
        AVG(cr.review_score) AS metric_value,
        COUNT(*) AS review_count,
        COUNT(DISTINCT o.order_id) AS order_count
      FROM raw.orders o
      JOIN analytics.canonical_reviews cr ON o.order_id = cr.order_id
      JOIN raw.customers c ON o.customer_id = c.customer_id
      ${needsSellerJoin ? sellerJoin : ''}
      ${category ? 'JOIN analytics.order_categories oc ON o.order_id = oc.order_id' : ''}
      ${whereClause}
      ${groupByClause}
      ORDER BY ${groupByExpr ? groupByExpr : '(SELECT NULL)'}
    `
  } else if (metric === 'review_count') {
    sql = `
      SELECT
        ${groupByExpr ? `${groupByExpr} AS group_key,` : ''}
        COUNT(*) AS metric_value,
        COUNT(DISTINCT o.order_id) AS order_count
      FROM raw.orders o
      JOIN analytics.canonical_reviews cr ON o.order_id = cr.order_id
      JOIN raw.customers c ON o.customer_id = c.customer_id
      ${needsSellerJoin ? sellerJoin : ''}
      ${category ? 'JOIN analytics.order_categories oc ON o.order_id = oc.order_id' : ''}
      ${whereClause}
      ${groupByClause}
      ORDER BY ${groupByExpr ? groupByExpr : '(SELECT NULL)'}
    `
  } else if (metric === 'average_response_days') {
    sql = `
      SELECT
        ${groupByExpr ? `${groupByExpr} AS group_key,` : ''}
        AVG(EXTRACT(EPOCH FROM (cr.review_answer_timestamp - cr.review_creation_date)) / 86400) AS metric_value,
        COUNT(*) AS review_count,
        COUNT(DISTINCT o.order_id) AS order_count
      FROM raw.orders o
      JOIN analytics.canonical_reviews cr ON o.order_id = cr.order_id
      JOIN raw.customers c ON o.customer_id = c.customer_id
      ${needsSellerJoin ? sellerJoin : ''}
      ${category ? 'JOIN analytics.order_categories oc ON o.order_id = oc.order_id' : ''}
      ${whereClause}
      AND cr.review_answer_timestamp IS NOT NULL
      AND cr.review_creation_date IS NOT NULL
      AND EXTRACT(EPOCH FROM (cr.review_answer_timestamp - cr.review_creation_date)) >= 0
      ${groupByClause}
      ORDER BY ${groupByExpr ? groupByExpr : '(SELECT NULL)'}
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

  assumptions.push(
    ...buildDateAssumptions(from, to),
    'Using canonical reviews (one per order, deduplicated by latest answer timestamp)',
  )

  if (metric === 'score_distribution') {
    if (groupByExpr) {
      return {
        ok: true,
        tool,
        data: result.rows.map((r) => ({
          group_key: r.group_key,
          score: Number(r.score),
          review_count: Number(r.review_count),
          order_count: Number(r.order_count),
        })),
        columns: [
          { name: 'group_key', type: 'string' },
          { name: 'score', type: 'number' },
          { name: 'review_count', type: 'number', unit: 'count' },
          { name: 'order_count', type: 'number', unit: 'count' },
        ],
        meta: {
          rowCount: result.rows.length,
          grain: `${groupByLabel} × score_distribution`,
          units: { review_count: 'count', order_count: 'count' },
          filters: { from, to, category, state, score, status, group_by },
          assumptions,
          dataVersion,
        },
      }
    }
    return {
      ok: true,
      tool,
      data: result.rows.map((r) => ({
        score: Number(r.score),
        review_count: Number(r.review_count),
        order_count: Number(r.order_count),
      })),
      columns: [
        { name: 'score', type: 'number' },
        { name: 'review_count', type: 'number', unit: 'count' },
        { name: 'order_count', type: 'number', unit: 'count' },
      ],
      meta: {
        rowCount: result.rows.length,
        grain: 'score_distribution',
        units: { review_count: 'count', order_count: 'count' },
        filters: { from, to, category, state, score, status },
        assumptions,
        dataVersion,
      },
    }
  }

  if (groupByExpr) {
    return {
      ok: true,
      tool,
      data: result.rows.map((r) => ({
        group_key: r.group_key,
        metric_value: r.metric_value !== null ? Number(r.metric_value) : null,
        review_count: Number(r.review_count),
        order_count: Number(r.order_count),
      })),
      columns: [
        { name: 'group_key', type: 'string' },
        { name: 'metric_value', type: 'number', unit: metric === 'average_score' ? 'stars' : metric === 'average_response_days' ? 'days' : 'count' },
        { name: 'review_count', type: 'number', unit: 'count' },
        { name: 'order_count', type: 'number', unit: 'count' },
      ],
      meta: {
        rowCount: result.rows.length,
        grain: `${groupByLabel} × ${metric}`,
        units: {
          metric_value: metric === 'average_score' ? 'stars' : metric === 'average_response_days' ? 'days' : 'count',
          review_count: 'count',
          order_count: 'count',
        },
        filters: { from, to, category, state, score, status, group_by },
        assumptions,
        dataVersion,
      },
    }
  }

  const categoryField = category ? { category } : {}
  const cohortMeta = cohort === 'delivered_reviewed_valid_delivery' ? getCohortMetadata() : undefined
  return {
    ok: true,
    tool,
    data: result.rows.map((r) => ({
      ...categoryField,
      metric_value: r.metric_value !== null ? Number(r.metric_value) : null,
      review_count: Number(r.review_count),
      order_count: Number(r.order_count),
    })),
    columns: [
      ...(category ? [{ name: 'category', type: 'string' as const }] : []),
      { name: 'metric_value', type: 'number' as const, unit: metric === 'average_score' ? 'stars' : metric === 'average_response_days' ? 'days' : 'count' },
      { name: 'review_count', type: 'number' as const, unit: 'count' },
      { name: 'order_count', type: 'number' as const, unit: 'count' },
    ],
    meta: {
      rowCount: result.rows.length,
      grain: `review_analysis × ${metric}`,
      units: {
        metric_value: metric === 'average_score' ? 'stars' : metric === 'average_response_days' ? 'days' : 'count',
        review_count: 'count',
        order_count: 'count',
      },
      filters: { from, to, category, state, score, status },
      ...(cohortMeta ? { cohort: cohortMeta.cohort, assumptions: cohortMeta.assumptions } : { assumptions }),
      dataVersion,
    },
  }
}
