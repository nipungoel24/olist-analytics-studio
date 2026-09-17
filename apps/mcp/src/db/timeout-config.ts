// Hardened timeout configuration parsing shared by MCP query runner.
// Invalid configuration falls back deterministically to the default instead of
// producing NaN/Infinity SQL or runaway values.

export interface TimeoutBounds {
  min: number
  max: number
}

export function parseTimeoutMs(
  raw: string | undefined,
  fallback: number,
  bounds: TimeoutBounds = { min: 100, max: 60_000 },
  logger?: (msg: string) => void
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    if (logger) {
      logger(`Invalid timeout configuration "${raw}"; falling back to ${fallback}ms`)
    } else {
      process.stderr.write(`[mcp] Invalid timeout configuration "${raw}"; falling back to ${fallback}ms\n`)
    }
    return fallback
  }
  return parsed
}
