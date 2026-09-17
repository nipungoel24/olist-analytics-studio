import { runQuery } from '../db/query-runner.js'

export interface DateExtent {
  min_date: string | null
  max_date: string | null
}

export async function getDateExtent(): Promise<DateExtent> {
  const result = await runQuery<{ min_date: string | null; max_date: string | null }>(
    `SELECT
       MIN(order_purchase_timestamp)::text AS min_date,
       MAX(order_purchase_timestamp)::text AS max_date
     FROM raw.orders
     WHERE order_purchase_timestamp IS NOT NULL`,
    [],
    'dataset_metadata'
  )

  if ('code' in result) {
    return { min_date: null, max_date: null }
  }

  return {
    min_date: result.rows[0]?.min_date ?? null,
    max_date: result.rows[0]?.max_date ?? null,
  }
}

export async function getSupportedCategories(): Promise<string[]> {
  const result = await runQuery<{ product_category_name_english: string }>(
    `SELECT DISTINCT product_category_name_english
     FROM raw.product_category_name_translation
     WHERE product_category_name_english IS NOT NULL
     ORDER BY product_category_name_english`,
    [],
    'dataset_metadata'
  )

  if ('code' in result) {
    return []
  }

  return result.rows.map((r) => r.product_category_name_english)
}

export async function getSupportedStates(): Promise<string[]> {
  const result = await runQuery<{ customer_state: string }>(
    `SELECT DISTINCT customer_state
     FROM raw.customers
     WHERE customer_state IS NOT NULL
     ORDER BY customer_state`,
    [],
    'dataset_metadata'
  )

  if ('code' in result) {
    return []
  }

  return result.rows.map((r) => r.customer_state)
}

export async function getDataVersion(): Promise<string> {
  const result = await runQuery<{ source_checksum: string }>(
    `SELECT dv.source_checksum
     FROM app.active_dataset ad
     JOIN app.dataset_versions dv ON ad.dataset_version_id = dv.version_id`,
    [],
    'dataset_metadata'
  )

  if ('code' in result) {
    return 'unknown'
  }

  return result.rows[0]?.source_checksum ?? 'unknown'
}

export async function getRowCounts(): Promise<Record<string, number>> {
  const tables = [
    'raw.orders',
    'raw.customers',
    'raw.order_items',
    'raw.order_payments',
    'raw.order_reviews',
    'raw.products',
    'raw.sellers',
  ]

  const counts: Record<string, number> = {}

  for (const table of tables) {
    const result = await runQuery<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM ${table}`,
      [],
      'dataset_metadata'
    )

    if (!('code' in result)) {
      counts[table.replace('raw.', '')] = parseInt(result.rows[0]?.cnt ?? '0', 10)
    }
  }

  return counts
}
