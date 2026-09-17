import { type CategoryPerformanceInput } from '@olist/contracts'
import { runQuery } from '../db/query-runner.js'
import { buildDateFilter, combineConditions, buildDateAssumptions } from '../analytics/date-filter.js'
import { getCategoryFilter } from '../analytics/category-resolution.js'
import { getDataVersion } from '../analytics/dataset-metadata.js'
import type { ToolResponse } from '@olist/contracts'

export const CATEGORY_PERFORMANCE_TOOL = {
  name: 'category_performance',
  title: 'Category Performance',
  description: `Returns product category analytics: revenue, order volume, review score, freight, and rankings.
All results use English category names.
Use for questions about category comparisons like "Which product categories generate the most revenue?"`,
  inputSchema: {
    from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
    to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
    metric: { type: 'string', enum: ['revenue', 'order_count', 'average_review_score', 'total_freight', 'item_count'], default: 'revenue' },
    category: { type: 'string', description: 'Filter by English category name' },
    limit: { type: 'number', description: 'Max rows', default: 10 },
    sort: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    status: { type: 'string', description: 'Filter by order status' },
  },
}

const METRIC_QUERIES: Record<string, string> = {
  revenue: `
    SELECT
      COALESCE(t.product_category_name_english, 'Untranslated category') AS category_english,
      p.product_category_name,
      SUM(oi.price) AS metric_value,
      COUNT(DISTINCT o.order_id) AS order_count
    FROM raw.orders o
    JOIN raw.order_items oi ON o.order_id = oi.order_id
    JOIN raw.products p ON oi.product_id = p.product_id
    LEFT JOIN raw.product_category_name_translation t ON p.product_category_name = t.product_category_name
    {filters}
    GROUP BY p.product_category_name, t.product_category_name_english
    ORDER BY metric_value {sort}, category_english ASC
    LIMIT $1
  `,
  order_count: `
    SELECT
      COALESCE(t.product_category_name_english, 'Untranslated category') AS category_english,
      p.product_category_name,
      COUNT(DISTINCT o.order_id) AS metric_value,
      COUNT(DISTINCT o.order_id) AS order_count
    FROM raw.orders o
    JOIN raw.order_items oi ON o.order_id = oi.order_id
    JOIN raw.products p ON oi.product_id = p.product_id
    LEFT JOIN raw.product_category_name_translation t ON p.product_category_name = t.product_category_name
    {filters}
    GROUP BY p.product_category_name, t.product_category_name_english
    ORDER BY metric_value {sort}, category_english ASC
    LIMIT $1
  `,
  average_review_score: `
    SELECT
      COALESCE(t.product_category_name_english, 'Untranslated category') AS category_english,
      p.product_category_name,
      AVG(cr.review_score) AS metric_value,
      COUNT(DISTINCT o.order_id) AS order_count
    FROM raw.orders o
    JOIN raw.order_items oi ON o.order_id = oi.order_id
    JOIN raw.products p ON oi.product_id = p.product_id
    LEFT JOIN raw.product_category_name_translation t ON p.product_category_name = t.product_category_name
    JOIN analytics.canonical_reviews cr ON o.order_id = cr.order_id
    {filters}
    GROUP BY p.product_category_name, t.product_category_name_english
    ORDER BY metric_value {sort}, category_english ASC
    LIMIT $1
  `,
  total_freight: `
    SELECT
      COALESCE(t.product_category_name_english, 'Untranslated category') AS category_english,
      p.product_category_name,
      SUM(oi.freight_value) AS metric_value,
      COUNT(DISTINCT o.order_id) AS order_count
    FROM raw.orders o
    JOIN raw.order_items oi ON o.order_id = oi.order_id
    JOIN raw.products p ON oi.product_id = p.product_id
    LEFT JOIN raw.product_category_name_translation t ON p.product_category_name = t.product_category_name
    {filters}
    GROUP BY p.product_category_name, t.product_category_name_english
    ORDER BY metric_value {sort}, category_english ASC
    LIMIT $1
  `,
  item_count: `
    SELECT
      COALESCE(t.product_category_name_english, 'Untranslated category') AS category_english,
      p.product_category_name,
      COUNT(*) AS metric_value,
      COUNT(DISTINCT o.order_id) AS order_count
    FROM raw.orders o
    JOIN raw.order_items oi ON o.order_id = oi.order_id
    JOIN raw.products p ON oi.product_id = p.product_id
    LEFT JOIN raw.product_category_name_translation t ON p.product_category_name = t.product_category_name
    {filters}
    GROUP BY p.product_category_name, t.product_category_name_english
    ORDER BY metric_value {sort}, category_english ASC
    LIMIT $1
  `,
}

export async function handleCategoryPerformance(input: CategoryPerformanceInput): Promise<ToolResponse> {
  const tool = 'category_performance'
  const { metric, from, to, category, limit, sort, status } = input

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
  const params: unknown[] = [limit]
  let paramIdx = 2

  // Default to delivered orders for monetary metrics
  if (['revenue', 'total_freight'].includes(metric)) {
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

  // Category filter - filter on the translated English name directly
  if (category) {
    const catFilter = await getCategoryFilter(category, paramIdx)
    if (!catFilter) {
      return {
        ok: false,
        tool,
        error: { code: 'UNKNOWN_CATEGORY', message: `Unknown category: "${category}". Use dataset_metadata to list available categories.` },
      }
    }
    if ('error' in catFilter) {
      return {
        ok: false,
        tool,
        error: { code: catFilter.code, message: catFilter.message },
      }
    }
    // Filter on the resolved English name
    filters.push(`COALESCE(t.product_category_name_english, 'Untranslated category') = $${paramIdx}`)
    params.push(catFilter.params[0])
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
      error: { code: 'EMPTY_RESULT', message: 'No matching categories were found for the supplied filters.' },
    }
  }

  const dataVersion = await getDataVersion()
  const assumptions = [
    ...buildDateAssumptions(from, to),
    'Revenue = SUM(item.price), excluding freight',
    metric === 'average_review_score' ? 'Using canonical reviews (one per order, deduplicated)' : '',
  ].filter(Boolean)

  return {
    ok: true,
    tool,
    data: result.rows.map((r) => ({
      category_english: r.category_english,
      category_portuguese: r.product_category_name,
      metric_value: r.metric_value !== null ? Number(r.metric_value) : null,
      order_count: Number(r.order_count),
    })),
    columns: [
      { name: 'category_english', type: 'string' },
      { name: 'category_portuguese', type: 'string' },
      { name: 'metric_value', type: 'number', unit: metric === 'revenue' || metric === 'total_freight' ? 'BRL' : metric === 'average_review_score' ? 'stars' : 'count' },
      { name: 'order_count', type: 'number', unit: 'count' },
    ],
    meta: {
      rowCount: result.rows.length,
      grain: `category × ${metric}`,
      units: {
        metric_value: metric === 'revenue' || metric === 'total_freight' ? 'BRL' : metric === 'average_review_score' ? 'stars' : 'count',
        order_count: 'count',
      },
      filters: { from, to, metric, category, limit, sort, status },
      assumptions,
      dataVersion,
    },
  }
}
