export interface DateFilter {
  conditions: string[]
  params: unknown[]
  nextParamIndex: number
}

export function buildDateFilter(
  from: string | undefined,
  to: string | undefined,
  column: string,
  startParamIndex: number = 1
): DateFilter {
  const conditions: string[] = []
  const params: unknown[] = []
  let idx = startParamIndex

  if (from) {
    conditions.push(`${column} >= $${idx}`)
    params.push(from)
    idx++
  }

  if (to) {
    conditions.push(`${column} < $${idx}::date + INTERVAL '1 day'`)
    params.push(to)
    idx++
  }

  return { conditions, params, nextParamIndex: idx }
}

export function combineConditions(filters: string[]): string {
  if (filters.length === 0) return ''
  return `WHERE ${filters.join(' AND ')}`
}

export function buildDateAssumptions(from: string | undefined, to: string | undefined): string[] {
  const assumptions: string[] = []
  if (!from && !to) {
    assumptions.push('No date range specified; using full imported dataset')
  } else if (from && !to) {
    assumptions.push(`From ${from} to end of dataset`)
  } else if (!from && to) {
    assumptions.push(`From start of dataset to ${to}`)
  }
  return assumptions
}
