# PHASE 3 COMPLETION / ACCEPTANCE REPORT

**Date**: 2026-09-08T17:05:00Z
**Phase**: Phase 3 — Deterministic fallback and charts
**Status**: PASS — Recommended: APPROVE PHASE 3

---

## A. Overall result

**PASS**

The complete deterministic backend analysis path is implemented and verified against the real Docker/PostgreSQL/MCP stack: question → RuleBasedAgent → canonical normalization → ExecutablePlan → real MCP tool calls → dependency resolution / keyed merge → normalized analytical data → deterministic bar-only fallback charts → deterministic factual insight → AgentResult → POST /api/analyses. No LLM or API key is required anywhere; `AGENT_MODE=fallback` works with zero provider configuration. All ten assignment questions return truthful analyses with real numeric results.

---

## B. Phase 2 regression status

Previous baseline: **55/55 PASS**

Current: **83/83 PASS** (same 55 Phase 1+2 tests plus 28 new Phase 3 integration tests; zero Phase 2 assertions weakened)

Also unchanged: category attribution, seller attribution, fan-out, unknown categories, MCP transport, deterministic MCP ranking, multi-tool MCP groupings, Docker/API readiness.

---

## C. ILLMAgent / AgentResult contracts

- `apps/api/src/agents/interface.ts` — `ILLMAgent.run({question, requestId, signal}): Promise<AgentResult>`; routes depend only on this interface.
- `packages/contracts/src/agent.ts` — `AgentResultSchema`: status union success|partial|empty|unsupported|needs_clarification|error; analysisId, originalQuestion, actualMode (llm|fallback), fallbackReason, resolvedFilters, assumptions, normalizedData, chartOptions[], chartType, chartReason, insight, insightEvidence[], warnings, sources (tool provenance), dataVersion, executablePlan, message, errorCode. Error/no-data states carry chartOptions=[] / chartType=null.
- `packages/contracts/src/analysis.ts` — normalized shapes: time_series, ranking, composition, correlation, distribution (discriminated union, Zod-validated).
- Tests: RuleBasedAgent implements ILLMAgent; route depends on interface; AgentResult validates; actualMode='fallback'; zero provider dependency (fetch spy proves no network calls).

---

## D. ExecutablePlan

Schema: `packages/contracts/src/plan.ts` (planVersion=1, intent, question, filters, assumptions, cohort, nodes with dependency IDs and parameter bindings, keyed merge recipe, chart semantics). No functions, no raw SQL, no prompt text.

Single-tool example (Q1):
```json
{
  "planVersion": 1,
  "intent": "q1_monthly_revenue_trend",
  "filters": { "from": "2017-01-01", "to": "2017-12-31", "granularity": "month", "metric": "revenue" },
  "cohort": "delivered",
  "nodes": [
    { "nodeId": "monthlyRevenue", "tool": "order_trends",
      "params": { "granularity": "month", "metric": "revenue", "from": "2017-01-01", "to": "2017-12-31" },
      "bindings": [], "dependsOn": [] }
  ],
  "merge": null,
  "chart": { "chartType": "bar", "chartReason": "Fallback mode is intentionally limited to bar visualizations (normal policy for a single metric over time is line)." }
}
```

Q7 dynamic dependency example (no frozen IDs — refresh re-ranks and re-binds):
```json
{
  "intent": "q7_top_categories_reviews",
  "nodes": [
    { "nodeId": "categoryRanking", "tool": "category_performance",
      "params": { "metric": "order_count", "limit": 5, "sort": "desc" } },
    { "nodeId": "categoryReviews", "tool": "review_analysis",
      "params": { "metric": "average_score" },
      "dependsOn": ["categoryRanking"],
      "bindings": [{ "param": "category", "fromNode": "categoryRanking", "field": "category_english", "mode": "fan_out" }] }
  ],
  "merge": { "strategy": "keyed", "leftNode": "categoryRanking", "rightNode": "categoryReviews",
             "leftKey": "category_english", "rightKey": "category", "on": "category identity" }
}
```
Executor test proves a re-ranked category (e.g., "changed-cat") is bound at execution time, not frozen from plan creation.

---

## E. Parameter normalization

| Input phrase | Resolved value | Test |
|---|---|---|
| last year | 2017-01-01 / 2017-12-31 (never machine year) | ✓ |
| first half of 2017 | 2017-01-01 / 2017-06-30 | ✓ |
| São Paulo (seller question) | state=SP, seller_state side | ✓ |
| Sao Paulo (destination question) | state=SP, customer_state side | ✓ |
| bare "SP" | state=SP | ✓ |
| top 10 | limit 10, sort desc | ✓ |
| top 5 | limit 5, sort desc | ✓ |
| worst rated / lowest | sort asc | ✓ |
| electronics / eletronicos | category "electronics" (English catalog semantics, no hardcoded Portuguese) | ✓ |
| no date range | full dataset + explicit assumption, no silent 2017 | ✓ |

Date execution semantics: inclusive calendar dates at the normalizer; tools keep start-inclusive/next-day-exclusive predicates (unchanged Phase 2 contracts; no off-by-one).

---

## F. Fallback intent table

| ID | Question | Intent | MCP tools | Dependencies | Merge key | Resolved filters | Fallback chart |
|---|---|---|---|---|---|---|---|
| Q1 | monthly revenue trend for 2017 | q1_monthly_revenue_trend | order_trends | — | — | from/to=2017, month, revenue | bar |
| Q2 | categories with most revenue | q2_top_revenue_categories | category_performance | — | — | revenue desc limit 10, no date (full dataset) | bar |
| Q3 | worst delivery states | q3_worst_delivery_states | delivery_performance | — | — | on_time_rate asc limit 10 (worst first) | bar |
| Q4 | credit card vs boleto share | q4_payment_share | payment_breakdown | — | — | payment_value by type, overall denominator + Other | bar |
| Q5 | top 10 SP sellers | q5_top_sellers_sp | seller_performance | — | — | revenue, seller_state=SP, limit 10 desc | bar |
| Q6 | electronics score distribution | q6_electronics_review_distribution | review_analysis | — | — | score_distribution, category=electronics | bar |
| Q7 | top 5 categories review scores | q7_top_categories_reviews | category_performance → review_analysis | node2 depends on node1 | category identity | order_count top 5, then avg score per bound category | bar |
| Q8 | monthly orders + review score | q8_monthly_orders_and_reviews | order_trends + review_analysis | independent | month-start period | 2017, month, delivered cohort on BOTH tools | 2 bar panels |
| Q9 | faster delivery → better reviews | q9_seller_delivery_vs_reviews | delivery_performance + review_analysis | independent | seller_id | 10 fastest sellers, delivered_reviewed_valid_delivery cohort | 2 labeled limited bar panels |
| Q10 | delay + review score by state | q10_delay_and_reviews_by_state | delivery_performance + review_analysis | independent | customer state UF | all 27 states, delivered cohort on both tools | 2 bar panels |

Precedence: Q8, Q10, Q7, Q9 (multi-tool) are evaluated before single-tool patterns; ambiguity tests included.

Paraphrases tested: "revenue by month in 2017", "monthly sales for 2017", "best revenue categories", "lowest on-time states", "payment method split", "highest earning SP sellers", "electronics ratings distribution", "monthly orders and average review score".

False positives guarded: "stock price of Olist", "customer ages in São Paulo", "weather" → unsupported, zero MCP calls.

---

## G. Real Q1-Q10 execution (Docker HTTP, actual numbers)

| Q | HTTP | status | actualMode | tools | result summary | chart | insight (abridged) |
|---|---|---|---|---|---|---|---|
| Q1 | 200 | success | fallback | order_trends | 12 months, Nov peak R$987,765.37 | bar | "Revenue was highest in November 2017 at R$987,765.37." |
| Q2 | 200 | success | fallback | category_performance | health_beauty R$1,233,131.72 top of 10 shown | bar | "health_beauty generated the highest revenue at R$1,233,131.72 (among the displayed categories)." |
| Q3 | 200 | success | fallback | delivery_performance | AL worst at 76.1% on-time (10 states) | bar | "AL had the lowest on-time rate at 76.1%." |
| Q4 | 200 | success | fallback | payment_breakdown | credit_card 78.3% / boleto / Other (overall denominator) | bar | "Credit cards accounted for 78.3% of payment value." |
| Q5 | 200 | success | fallback | seller_performance | 10 SP sellers, top R$226,987.93 | bar | "Seller 4869f7a5 generated the highest revenue in São Paulo at R$226,987.93." |
| Q6 | 200 | success | fallback | review_analysis | 1-5 distribution, 5★ = 1,424 most common | bar | "5-star reviews were the most common, with 1,424 reviews." |
| Q7 | 200 | success | fallback | category_performance + review_analysis | 5 top categories by order volume with avg scores; health_beauty 4.18★ | bar | "health_beauty had the highest average review score (4.18 stars) among the top 5 categories by order volume." |
| Q8 | 200 | success | fallback | order_trends + review_analysis | monthly orders + avg score on same month axis (delivered cohort) | 2 bar panels | "Monthly delivered orders peaked in November 2017 at 7,289 orders, when the average review score was 3.99 stars." |
| Q9 | 200 | success | fallback | delivery_performance + review_analysis | 10 fastest sellers, days + stars | 2 labeled limited bar panels | "…the faster-delivering half has a higher average review score (4.8 vs 4 stars); this is a descriptive comparison, not a causal finding." |
| Q10 | 200 | success | fallback | delivery_performance + review_analysis | 27 states, delay days + stars | 2 bar panels | "Average delivery delay was highest in AL at -8 days, where the average review score was 3.85 stars." |

All ten persisted with analysisId (app.analyses + app.analysis_snapshots; 16 success + 2 partial snapshots verified in DB, surviving container restart).

---

## H. Multi-tool execution evidence (Q7-Q10)

- Q7: dependent execution — categoryRanking runs first; categoryReviews fans out 5 calls with the freshly returned category names bound at execution time (executor test proves re-ranking rebinds fresh IDs). Merge on category identity; 5 merged rows.
- Q8: independent concurrent execution; keyed merge on month-start period; both tools use status='delivered' for one comparable cohort (order_trends and review_analysis both support the status filter; review_analysis gained the status param as a Phase-2 gap exposed by Phase 3).
- Q9: matching cohort delivered_reviewed_valid_delivery; merge on seller_id; left side = 10 fastest sellers; right-only rows dropped with warnings.
- Q10: matching cohort delivered; merge on customer state UF; 27 states.

---

## I. Keyed merge behavior

Unit-tested: different row orderings (joins by key, never position), missing key on one side (left-only kept + warning, right-only dropped + warning), duplicate key (MergeError), null key (dropped + warning), empty side, null metric preserved as null. Data-version equality enforced by the executor (retry once → DATA_VERSION_CONFLICT), so merged datasets never mix versions.

---

## J. Generic chart factory matrix (normal mode, prepared for Phase 4)

| Data shape | Expected chart | Actual | Test |
|---|---|---|---|
| one metric over time | line | line, 1 dataset | ✓ |
| two metrics over same time axis | dual-axis line (named yAxisIDs) | line, separate yAxisIDs + scale titles | ✓ |
| ranked list | horizontal bar | bar, indexAxis y, deterministic order | ✓ |
| category comparison in one period | vertical bar | bar, indexAxis x | ✓ |
| part-to-whole | doughnut (display "Donut") | doughnut, canonical values | ✓ |
| two continuous variables per entity | scatter (1 point/entity) | scatter with {x,y,key} points | ✓ |
| 1-5 score distribution | stacked horizontal bar | bar, indexAxis y, stacked x+y, 5 score datasets, missing bucket = known zero | ✓ |

All configs: JSON round-trip + strict allowlist Zod validation; serialized output contains no functions/eval/callbacks. Ambiguity support: ranking returns exactly two validated options (horizontal + vertical bar) with unique ids and justification each.

Fallback never uses this selector: RuleBasedAgent calls `fallbackChartOptions` exclusively.

---

## K. Fallback bar-only verification

All ten successful fallback results produce ONLY `type: 'bar'` configs (1 panel for Q1-Q7, 2 panels for Q8/Q9/Q10). No line, doughnut, scatter or stacked fallback. Q9 panels are explicitly labeled "Limited descriptive comparison only; not a correlation test". Q8/Q10 mixed units (count/stars, days/stars) are separate panels with separate scales — never a shared axis.

---

## L. Insight verification

Representative evidence-backed sentences (from real runs, section G): all numeric claims come from normalized MCP output; evidence arrays record operation/key/metric/value/rowsUsed. Q9 insight is descriptive only ("…not a causal finding") with `descriptive_comparison` evidence; deterministic repeated runs produce identical sentences; unsupported/empty states produce no insight.

---

## M. Unsupported / empty / partial / error matrix

| Case | Behavior | Verified |
|---|---|---|
| unsupported (stock/weather/demographics/profit/inventory) | status=unsupported, chart=null, message with supported-domain list, zero MCP calls | ✓ unit + HTTP |
| valid filter, no data (2099) | status=empty, chart=null, effective filters + message | ✓ unit + HTTP |
| one multi-tool source times out | status=partial, surviving source retained in normalizedData, failed source named in warnings + provenance, chart=null | ✓ unit + inject |
| all required sources fail | status=error, chart=null, errorCode propagated (DATABASE_ERROR/QUERY_TIMEOUT/…) | ✓ unit |
| dependency node empty/failed | dependent node failed with dependency message | ✓ executor unit |
| request too long / malformed body | HTTP 400 before agent runs | ✓ HTTP |
| AGENT_MODE=llm (not implemented) | HTTP 501, errorCode MODE_NOT_IMPLEMENTED, clear Phase 4 message — no fake LLM | ✓ HTTP |
| MCP child disconnected | structured DATA_UNAVAILABLE → error, no crash | ✓ |

---

## N. Cancellation / deadline behavior

Executor clamps every tool call to min(toolTimeoutMs, remaining budget); client-side race marks timed-out nodes QUERY_TIMEOUT; aborted AbortSignal fails pending calls; real SQL cancellation remains the MCP statement_timeout (hardened: invalid TOOL_TIMEOUT_MS env now falls back deterministically — NaN bug closed, tests in apps/mcp/src/db/timeout-config.test.ts). `Promise.race` is only a fail-fast guard, not the primary abort. MODEL_TIMEOUT_MS untouched (Phase 4).

---

## O. POST /api/analyses

Request: `{ "question": "..." }`. Validation: malformed body → 400 INVALID_REQUEST; empty → 400; > MAX_REQUEST_LENGTH (2000) → 400 REQUEST_TOO_LONG. Request ID generated per call; AbortSignal wired to client disconnect. Responses: success/partial/empty/unsupported → 200; infrastructure error → 500; MODE_NOT_IMPLEMENTED → 501. Success results include analysisId (persisted: app.analyses + bounded app.analysis_snapshots with normalizedData, chartOptions, insight, warnings, status). Tests: valid Q1/Q7/Q9, unsupported, empty, malformed, too-long, MODE_NOT_IMPLEMENTED, partial-tool-timeout, zero-provider-requests — all via real Fastify inject + real MCP/PostgreSQL.

---

## P. Automated tests

New Phase 3 tests:

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| apps/api (unit: config, normalizer, intents, merge, executor, charts, fallback, insight, agent, factory) — 9 files | 88 | 0 | 0 |
| apps/mcp (timeout-config hardening) — 1 file | 4 | 0 | 0 |
| tests/integration (phase3-agent, phase3-api) — 2 files | 28 | 0 | 0 |
| **New total** | **120** | **0** | **0** |

Phase 1+2 suites unchanged: fan-out 9, mcp-protocol 15, analytics-correctness 31 → 55.

Overall: **175/175 pass** (contracts/ingest/web have no test files; `passWithNoTests` configs added so `pnpm -r test` is a runnable repo-wide gate).

---

## Q. Quality gate

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile verified (updated once for new tests deps @olist/api/@olist/contracts) |
| `pnpm build` (root) | 0 | contracts, ingest, mcp, api, web |
| `pnpm typecheck` (root) | 0 | all packages |
| `pnpm -r test` | 0 | 175/175 |
| `docker compose config --quiet` | 0 | valid |
| `docker compose up --build` | 0 | chain automatic (db healthy → init exit 0 → api with MCP child) |
| GET /api/health | 200 | `{"status":"ok",...}` |
| GET /api/ready | 200 | database true, dataVersion present, mcpReady true |
| POST /api/analyses smoke | 10/10 success + guardrails | real numbers (section G) |
| format / lint | — | NOT CONFIGURED (no package defines format/lint scripts) |

---

## R. Docker real-stack verification

Fresh `docker compose up --build` after a full down: db healthy (127.0.0.1:5433), init exited 0 (idempotent, dataset version already imported), api up on 3000 with MCP child listing 7 tools. Env inheritance fix verified: the MCP child receives DATABASE_URL explicitly (SDK v2 stdio inherits only a safe allowlist by default — this was a real container-only bug found and fixed during verification). Port 3000 conflict with an unrelated Next.js process was resolved with user approval earlier in the session.

---

## S. Security review

- No arbitrary SQL: plans contain static tool names/params; all SQL remains inside MCP allowlisted queries.
- No eval / Function constructors anywhere; chart configs are strict-allowlist Zod objects, JSON round-trip tested.
- No provider requests: RuleBasedAgent has zero provider SDK imports; fetch-spy test proves no network calls.
- Request cap: 2,000 chars enforced at route AND agent.
- Tool output treated as data only; question text is untrusted input (regex-matched, length-capped).
- Structured failures; no stack traces or credentials in responses (messages bounded to 400 chars).
- DB writes restricted to app schema (analyses/snapshots); analytics credentials untouched.

---

## T. Known limitations

1. LLM mode not implemented (Phase 4): AGENT_MODE=llm returns 501 MODE_NOT_IMPLEMENTED — never faked.
2. Fallback is keyword-based, not general language understanding; unknown phrasings return a supported-domain message.
3. Q9/Q10 fallback is a descriptive comparison, not a correlation statistic (by design).
4. Tool calls are bounded by client-side race + MCP statement_timeout; underlying MCP SDK callTool cannot be hard-aborted mid-flight (SQL is cancelled by statement_timeout).
5. `docker exec` psql was unavailable in the alpine image for interactive checks; persistence verified via pg client instead.
6. format/lint NOT CONFIGURED.
7. Web UI (Phase 5) and pins/refresh (Phase 5) remain unbuilt.

---

## U. Files created

Contracts: `packages/contracts/src/{chart,analysis,plan,agent}.ts`
API: `apps/api/src/{config,app}.ts`, `apps/api/src/db/pool.ts`, `apps/api/src/mcp/adapter.ts`, `apps/api/src/agents/{interface,rule-based-agent,factory,index}.ts`, `apps/api/src/analysis/{index,normalizer,intents,executor,merge,normalized-data,insight}.ts`, `apps/api/src/analysis/charts/{factories,selector,fallback}.ts`, `apps/api/src/routes/analyses.ts`, `apps/api/vitest.config.ts`
MCP: `apps/mcp/src/db/timeout-config.ts`, `apps/mcp/vitest.config.ts`
Tests: 9 unit test files in apps/api/src, 1 in apps/mcp/src, `tests/integration/{phase3-agent,phase3-api}.test.ts`, `tests/runtime/{phase3-matrix,check-persistence}.mjs`
Config: `packages/contracts/vitest.config.ts`, `apps/ingest/vitest.config.ts`, `apps/web/vitest.config.ts`

## V. Files modified

- `packages/contracts/src/index.ts`, `packages/contracts/src/errors.ts` (+DATA_UNAVAILABLE, DATA_VERSION_CONFLICT)
- `packages/contracts/src/schemas/input.ts` (review_analysis status param — Phase 2 cohort gap exposed by Phase 3)
- `apps/mcp/src/server.ts` (review_analysis status schema), `apps/mcp/src/tools/review-analysis.ts` (status filter), `apps/mcp/src/db/query-runner.ts` (hardened timeout parse)
- `apps/api/src/server.ts` (rewired to config/app/agent/adapter; dynamic adapter; explicit child env), `apps/api/package.json` (exports), `apps/api/tsconfig.json`, `apps/mcp/tsconfig.json` (exclude tests from build)
- `Architecture.md` (api boot description, error codes, review_analysis cohort note)
- `tests/package.json` (+@olist/api, @olist/contracts), `pnpm-lock.yaml`

## W. Git state

- Branch: `main`
- HEAD: no commits yet (repository has never been committed; all files untracked)
- `git status --short`: all paths `??`
- `git diff --stat`: empty
- Recommendation: a Phase 1-3 checkpoint commit is strongly recommended before Phase 4 (no push performed).

## X. Memory.md state

- Phase 1: COMPLETED AND APPROVED
- Phase 2: COMPLETED AND APPROVED
- Phase 3: COMPLETED — AWAITING USER APPROVAL
- Phase 4: NOT STARTED

## Y. Recommendation

**APPROVE PHASE 3**
