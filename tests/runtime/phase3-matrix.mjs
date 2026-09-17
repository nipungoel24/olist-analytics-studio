import { writeFileSync } from 'fs'

const BASE = 'http://localhost:3000'

const QUESTIONS = [
  'Show monthly revenue trend for 2017',
  'Which product categories generate the most revenue?',
  'Which states have the worst delivery performance?',
  'What share of payments are credit card vs boleto?',
  'Top 10 sellers by revenue in São Paulo',
  'Show review score distribution for electronics',
  'Compare review scores across the top 5 categories by order volume',
  'Show monthly orders and average review score together for 2017',
  'Do sellers with faster delivery get better reviews?',
  'Show delivery delay and review score side by side by state',
]

const out = { health: null, ready: null, analyses: [], errors: [] }

async function post(question) {
  const res = await fetch(`${BASE}/api/analyses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  return { http: res.status, body: await res.json() }
}

try {
  out.health = await (await fetch(`${BASE}/api/health`)).json()
  out.ready = await (await fetch(`${BASE}/api/ready`)).json()

  for (const q of QUESTIONS) {
    const { http, body } = await post(q)
    out.analyses.push({
      question: q,
      http,
      status: body.status,
      actualMode: body.actualMode,
      intent: body.executablePlan?.intent ?? null,
      resolvedFilters: body.resolvedFilters,
      assumptions: body.assumptions,
      tools: body.sources?.map((s) => s.tool) ?? [],
      rowCounts: body.sources?.map((s) => s.rowCount ?? null) ?? [],
      mergeOn: body.executablePlan?.merge?.on ?? null,
      chartType: body.chartType,
      chartCount: body.chartOptions?.length ?? 0,
      chartPanels: body.chartOptions?.map((c) => c.type) ?? [],
      chartReason: body.chartReason,
      insight: body.insight,
      dataVersion: body.dataVersion,
      analysisId: body.analysisId ?? null,
      warnings: body.warnings,
      message: body.message ?? null,
    })
  }

  const unsupported = await post('What is the stock price of Olist?')
  out.unsupported = { http: unsupported.http, status: unsupported.body.status, message: unsupported.body.message, chartCount: unsupported.body.chartOptions?.length ?? 0 }

  const tooLong = await post('x'.repeat(5000))
  out.tooLong = { http: tooLong.http, error: tooLong.body.error, message: tooLong.body.message }

  const malformed = await fetch(`${BASE}/api/analyses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wrongField: 1 }),
  })
  out.malformed = { http: malformed.status, body: await malformed.json() }
} catch (err) {
  out.errors.push(String(err))
}

writeFileSync('tests/runtime/phase3-matrix-output.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
