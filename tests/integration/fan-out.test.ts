import { describe, it, expect, beforeAll } from 'vitest'
import { Client } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'

const DATABASE_URL = process.env['DATABASE_URL'] || 'postgresql://olist:olist_dev@localhost:5433/olist'

async function query(sql: string, params?: unknown[]): Promise<unknown[]> {
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows
  } finally {
    await client.end()
  }
}

describe('Fan-out correctness fixtures', () => {
  beforeAll(async () => {
    const client = new Client({ connectionString: DATABASE_URL })
    await client.connect()
    try {
      const sql = readFileSync(
        join(import.meta.dirname, '..', 'fixtures', 'fan-out-test.sql'),
        'utf-8'
      )
      await client.query(sql)
    } finally {
      await client.end()
    }
  })
  it('items_by_order returns one row per order with correct totals', async () => {
    const rows = await query(
      'SELECT * FROM analytics.items_by_order WHERE order_id = $1',
      ['order-001']
    )
    expect(rows).toHaveLength(1)
    const row = rows[0] as Record<string, unknown>
    // 2 items: 100 + 50 = 150 merchandise, 15 + 10 = 25 freight
    expect(row.merchandise_total).toBe('150.00')
    expect(row.freight_total).toBe('25.00')
    expect(Number(row.item_count)).toBe(2)
  })

  it('canonical_reviews returns one row per order (deduplicated)', async () => {
    const rows = await query(
      'SELECT * FROM analytics.canonical_reviews WHERE order_id = $1',
      ['order-001']
    )
    expect(rows).toHaveLength(1)
    const row = rows[0] as Record<string, unknown>
    // review-002 has later answer timestamp (2017-03-29)
    expect(row.review_id).toBe('review-002')
    expect(row.review_score).toBe(5)
  })

  it('order_categories has distinct pairs', async () => {
    const rows = await query(
      'SELECT COUNT(*) as cnt FROM analytics.order_categories WHERE order_id = $1',
      ['order-001']
    )
    const row = rows[0] as Record<string, unknown>
    // order-001 has 2 items but both map to distinct category pairs
    expect(parseInt(row.cnt as string)).toBe(2)
  })

  it('order_sellers has distinct pairs', async () => {
    const rows = await query(
      'SELECT COUNT(*) as cnt FROM analytics.order_sellers WHERE order_id = $1',
      ['order-001']
    )
    const row = rows[0] as Record<string, unknown>
    // Both items from same seller, so only 1 distinct pair
    expect(parseInt(row.cnt as string)).toBe(1)
  })

  it('geolocation_by_prefix reduces duplicates', async () => {
    const rows = await query(
      'SELECT * FROM analytics.geolocation_by_prefix WHERE geolocation_zip_code_prefix = $1',
      ['01001']
    )
    expect(rows).toHaveLength(1)
  })

  it('leading-zero ZIP prefix is preserved as text', async () => {
    const rows = await query(
      'SELECT customer_zip_code_prefix FROM raw.customers WHERE customer_id = $1',
      ['cust-001']
    )
    const row = rows[0] as Record<string, unknown>
    expect(row.customer_zip_code_prefix).toBe('01001')
  })

  it('untranslated category shows "Untranslated category"', async () => {
    const rows = await query(
      "SELECT category_english FROM analytics.order_categories WHERE order_id = $1 AND product_category_name IS NULL",
      ['order-001']
    )
    const row = rows[0] as Record<string, unknown>
    expect(row.category_english).toBe('Untranslated category')
  })

  it('payment summary does not inflate with items', async () => {
    // If we naively join items x payments, we get 2x3 = 6 rows
    // But payment_summary_by_order should have 1 row per order
    const rows = await query(
      'SELECT * FROM analytics.payment_summary_by_order WHERE order_id = $1',
      ['order-001']
    )
    expect(rows).toHaveLength(1)
    const row = rows[0] as Record<string, unknown>
    // 3 payments: 100 + 40 + 25 = 165
    expect(row.total_payment_value).toBe('165.00')
    expect(Number(row.payment_line_count)).toBe(3)
  })

  it('no fan-out when joining items_by_order with canonical_reviews', async () => {
    // This is the critical test: joining aggregated items with deduplicated reviews
    // must NOT produce multiple rows per order
    const rows = await query(`
      SELECT i.order_id, i.merchandise_total, r.review_score
      FROM analytics.items_by_order i
      JOIN analytics.canonical_reviews r ON i.order_id = r.order_id
      WHERE i.order_id = $1
    `, ['order-001'])
    expect(rows).toHaveLength(1)
  })
})
