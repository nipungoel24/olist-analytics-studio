// Deterministic parameter resolution (PRD.md §5, assignment rules).
// This is keyword/pattern resolution only — not general geographical NLP.

export interface DateRange {
  from?: string
  to?: string
}

export interface Resolution {
  values: Record<string, unknown>
  assumptions: string[]
}

export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function normalized(text: string): string {
  return stripAccents(text).toLowerCase()
}

const LAST_YEAR_RE = /\blast year\b/i
const FIRST_HALF_2017_RE = /first half of 2017/i
const FIRST_HALF_GENERIC_RE = /\bfirst half of\b/i
const YEAR_RE = /\b(20\d{2})\b/

export function resolveDateRange(question: string): Resolution {
  const values: Record<string, unknown> = {}
  const assumptions: string[] = []

  if (LAST_YEAR_RE.test(question)) {
    values.from = '2017-01-01'
    values.to = '2017-12-31'
    assumptions.push(`"last year" resolved to 2017-01-01 through 2017-12-31 (assignment dataset definition, not the machine's current year)`)
    return { values, assumptions }
  }

  if (FIRST_HALF_2017_RE.test(question)) {
    values.from = '2017-01-01'
    values.to = '2017-06-30'
    assumptions.push(`"first half of 2017" resolved to 2017-01-01 through 2017-06-30`)
    return { values, assumptions }
  }

  if (FIRST_HALF_GENERIC_RE.test(question)) {
    values.from = '2017-01-01'
    values.to = '2017-06-30'
    assumptions.push(`"first half" resolved to the first half of 2017 (2017-01-01 through 2017-06-30)`)
    return { values, assumptions }
  }

  const yearMatch = question.match(YEAR_RE)
  if (yearMatch) {
    const year = yearMatch[1]
    values.from = `${year}-01-01`
    values.to = `${year}-12-31`
    assumptions.push(`Year ${year} resolved to ${year}-01-01 through ${year}-12-31`)
    return { values, assumptions }
  }

  assumptions.push('No date range was specified, so the full Olist dataset was used.')
  return { values, assumptions }
}

const SAO_PAULO_RE = /sao paulo/i
const SAO_PAULO_ACCENT_RE = /s[ãa]o paulo/i
const BARE_SP_RE = /\bsp\b/i

export type StateSide = 'seller' | 'destination' | 'either'

export function resolveSaoPaulo(question: string, side: StateSide): Resolution {
  const values: Record<string, unknown> = {}
  const assumptions: string[] = []
  const q = question

  const matched = SAO_PAULO_ACCENT_RE.test(q) || SAO_PAULO_RE.test(q) || BARE_SP_RE.test(q)
  if (!matched) {
    return { values, assumptions }
  }

  values.state = 'SP'
  if (side === 'seller') {
    values.stateSide = 'seller_state'
    assumptions.push(`"Sao Paulo" resolved to seller state SP (seller-specific query)`)
  } else if (side === 'destination') {
    values.stateSide = 'customer_state'
    assumptions.push(`"Sao Paulo" resolved to customer (destination) state SP`)
  } else {
    assumptions.push(`"Sao Paulo" resolved to state SP`)
  }
  return { values, assumptions }
}

const TOP_N_RE = /\btop\s*(\d{1,2})\b/i

export function resolveTopN(question: string): Resolution {
  const values: Record<string, unknown> = {}
  const assumptions: string[] = []
  const match = question.match(TOP_N_RE)
  if (match) {
    const n = Number(match[1])
    values.limit = Math.min(Math.max(n, 1), 100)
    values.sort = 'desc'
    assumptions.push(`"top ${n}" resolved to limit ${Math.min(Math.max(n, 1), 100)} descending by the requested metric`)
  }
  return { values, assumptions }
}

const WORST_RE = /\b(worst|lowest|poorest|slowest)\b/i

export function resolveWorst(question: string): Resolution {
  const values: Record<string, unknown> = {}
  const assumptions: string[] = []
  if (WORST_RE.test(question)) {
    values.sort = 'asc'
    assumptions.push(`"worst" resolved to ascending ordering where a lower value means worse`)
  }
  return { values, assumptions }
}

const ELECTRONICS_RE = /\belectronics\b|\beletronicos\b/i

export function resolveElectronics(question: string): Resolution {
  const values: Record<string, unknown> = {}
  const assumptions: string[] = []
  if (ELECTRONICS_RE.test(question)) {
    values.category = 'electronics'
    assumptions.push(`"electronics" resolved through the English category translation to canonical category "electronics"`)
  }
  return { values, assumptions }
}

export interface UnsupportedDomain {
  reason: string
}

const UNSUPPORTED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bstock\b|\bshare price\b|\bticker\b|\bmarket cap\b/i, reason: 'stock or financial-market data is not part of the Olist e-commerce dataset' },
  { re: /\bweather\b|\bforecast\b|\btemperature\b/i, reason: 'weather data is not part of the Olist e-commerce dataset' },
  { re: /\bcustomer ages?\b|\bage of\b|\bhow old\b|\bbirth\b/i, reason: 'customer ages are not part of the Olist e-commerce dataset' },
  { re: /\bgender\b|\bmale\b|\bfemale\b/i, reason: 'customer gender is not part of the Olist e-commerce dataset' },
  { re: /\bincome\b|\bsalary\b|\brevenue per customer\b/i, reason: 'customer income is not part of the Olist e-commerce dataset' },
  { re: /\binventory\b|\bstock level\b|\bwarehouse\b/i, reason: 'inventory data is not part of the Olist e-commerce dataset' },
  { re: /\bprofit\b|\bmargin\b|\bcost of goods\b/i, reason: 'profit/cost data is not part of the Olist e-commerce dataset (revenue is merchandise value, not net profit)' },
  { re: /\bcrypto\b|\bbitcoin\b/i, reason: 'cryptocurrency data is not part of the Olist e-commerce dataset' },
  { re: /\belection\b|\bpolitics\b|\bsports score\b/i, reason: 'this question is outside the Olist e-commerce domain' },
]

export function detectUnsupported(question: string): UnsupportedDomain | null {
  for (const pattern of UNSUPPORTED_PATTERNS) {
    if (pattern.re.test(question)) {
      return { reason: pattern.reason }
    }
  }
  return null
}

export const SUPPORTED_DOMAIN_MESSAGE =
  'This workspace answers questions about Olist e-commerce data: revenue, orders, product categories, sellers, reviews, payments and delivery performance across time, category, seller and Brazilian state dimensions.'
