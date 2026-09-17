import pg from 'pg'

const DATABASE_URL = process.env['DATABASE_URL'] || 'postgresql://olist:olist_dev@localhost:5433/olist'

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }
  return pool
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
