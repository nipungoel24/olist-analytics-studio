import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const pg = require('pg')

const c = new pg.Client({ connectionString: 'postgresql://olist:olist_dev@localhost:5433/olist' })
await c.connect()
try {
  const r1 = await c.query('SELECT agent_mode, count(*) AS n FROM app.analyses GROUP BY agent_mode ORDER BY agent_mode')
  const r2 = await c.query('SELECT status, count(*) AS n FROM app.analysis_snapshots GROUP BY status ORDER BY status')
  const r3 = await c.query('SELECT a.original_question, s.status, s.insight FROM app.analyses a JOIN app.analysis_snapshots s ON a.analysis_id = s.analysis_id ORDER BY a.created_at DESC LIMIT 3')
  console.log(JSON.stringify({ analyses: r1.rows, snapshots: r2.rows, latest: r3.rows }, null, 2))
} finally {
  await c.end()
}
