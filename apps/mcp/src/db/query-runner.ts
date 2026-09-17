import { getPool } from './pool.js'
import { toolError, type ToolError } from '@olist/contracts'
import { ErrorCode } from '@olist/contracts'
import { parseTimeoutMs } from './timeout-config.js'

const TOOL_TIMEOUT_MS = parseTimeoutMs(process.env['TOOL_TIMEOUT_MS'], 5000)

export interface QueryResult<T extends Record<string, unknown> = Record<string, unknown>> {
  rows: T[]
  durationMs: number
}

export async function runQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[],
  toolName: string,
  timeoutMs: number = TOOL_TIMEOUT_MS
): Promise<QueryResult<T> | ToolError> {
  const pool = getPool()
  const client = await pool.connect()
  const start = Date.now()

  try {
    await client.query(`SET statement_timeout TO ${timeoutMs}`)
    const result = await client.query<T>(sql, params)
    const durationMs = Date.now() - start

    process.stderr.write(`[mcp:${toolName}] query ${durationMs}ms, ${result.rowCount} rows\n`)

    return { rows: result.rows, durationMs }
  } catch (err) {
    const durationMs = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)

    if (msg.includes('canceling statement due to statement timeout')) {
      process.stderr.write(`[mcp:${toolName}] query timeout after ${durationMs}ms\n`)
      return toolError(ErrorCode.QUERY_TIMEOUT, `Query timed out after ${timeoutMs}ms`, toolName)
    }

    process.stderr.write(`[mcp:${toolName}] database error: ${msg}\n`)
    return toolError(ErrorCode.DATABASE_ERROR, `Database query failed: ${msg}`, toolName)
  } finally {
    try { client.release() } catch { /* client may not be valid */ }
  }
}
