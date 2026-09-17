# Requirements Matrix — Olist Analytics Studio

Mapping of assignment requirements to implementation components, phases, and acceptance tests.
Created 2026-09-06 (Phase 0). Every row traces to PRD.md, Architecture.md, or Phases.md.

## Dataset and Ingestion

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| D1 | Import 8 core Olist CSVs + category translation (9 files total) | PRD §2 | apps/ingest | P1 | All 9 CSVs loaded; row counts match archive |
| D2 | Validate CSV filenames and headers against expected set | PRD §4 | apps/ingest | P1 | Unknown files rejected with actionable diagnostic |
| D3 | Preserve ZIP leading-zero prefixes, decimal currency, nullable timestamps | PRD §6 | apps/ingest | P1 | Leading-zero ZIP '01001' stored as text, not numeric |
| D4 | Transactional import: atomic activation, failed import leaves prior data | Architecture §4 | apps/ingest | P1 | Broken archive does not activate partial database |
| D5 | Idempotent import: checksum match skips re-import | Architecture §4 | apps/ingest | P1 | Second import with same data → no duplicates |
| D6 | Dataset version ledger with checksums, row counts, imported_at | Architecture §4 | apps/ingest | P1 | dataset_versions table populated |
| D7 | Join orders to customers on customer_id (not order_id) | PRD §4 | apps/mcp | P1 | Fixture: order → customer join returns correct customer_unique_id |
| D8 | Category translation always joined for product/category queries | PRD §5 | apps/mcp | P1 | Untranslated category shows "Untranslated category" with canonical ID |
| D9 | Geolocation reduced to one row per prefix before any join | Architecture §4 | apps/ingest | P1 | Duplicate prefix fixture: geolocation_by_prefix has 1 row per prefix |

## Fan-out Prevention

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| F1 | Preaggregate one-to-many facts: items_by_order, payments_by_order | Architecture §4 | apps/mcp | P2 | 2-item order: items_by_order returns 1 row with correct SUM(price) |
| F2 | Deduplicate reviews deterministically (latest answer timestamp, then creation, then stable tie-break) | PRD §6 | apps/mcp | P2 | Order with 2 reviews: canonical_reviews returns 1 row |
| F3 | Distinct order-category bridges (no repeated review contributions within group) | Architecture §4 | apps/mcp | P2 | No duplicate (order_id, category_id) pairs |
| F4 | Distinct order-seller bridges (no repeated review contributions within group) | Architecture §4 | apps/mcp | P2 | No duplicate (order_id, seller_id) pairs |
| F5 | Never join raw items × raw payments × raw reviews (demonstrate with fixture) | Architecture §4 | apps/mcp | P2 | Fan-out fixture: naive join inflates, preaggregated does not |

## Business Metrics

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| M1 | Revenue = SUM(item.price) in BRL, delivered orders, excluding freight | PRD §6 | apps/mcp | P2 | Excludes freight_value; only delivered status |
| M2 | Payment value = SUM(payment_value), distinct from revenue | PRD §6 | apps/mcp | P2 | Mixed payment order: payment_value sum matches expected |
| M3 | Review score = one canonical review per order, deduplicated | PRD §6 | apps/mcp | P2 | Mean score matches manually computed value |
| M4 | Delivery duration = delivered_timestamp − purchase_timestamp (days) | PRD §6 | apps/mcp | P2 | Null timestamps excluded; valid durations correct |
| M5 | Delay = actual_delivery − estimated_delivery (positive = late) | PRD §6 | apps/mcp | P2 | On-time means actual ≤ estimated |
| M6 | Customer identity uses customer_unique_id for distinct people | PRD §6 | apps/mcp | P2 | customer_id is order-linked; customer_unique_id is distinct person |
| M7 | Review response interval = review_answer − review_creation (survey interval) | PRD §6 | apps/mcp | P2 | Invalid timestamps excluded with count |
| M8 | Freight = SUM(freight_value) or mean freight per item, as labeled | PRD §6 | apps/mcp | P2 | Correctly labeled as freight metric |

## Filter Resolution

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| FR1 | "last year" → from 2017-01-01, to 2017-12-31 | PRD §5 | apps/api | P3 | Date phrase resolves to exact dates |
| FR2 | "first half of 2017" → from 2017-01-01, to 2017-06-30 | PRD §5 | apps/api | P3 | Half-year resolves correctly |
| FR3 | "São Paulo" → SP; seller_state for seller questions, customer_state for customer/destination | PRD §5 | apps/api | P3 | Side-aware filter applied |
| FR4 | "top 10" → limit 10, descending by requested metric, stable ID tie-break | PRD §5 | apps/api | P3 | Ranking correct with tie-breaking |
| FR5 | "worst rated" → ascending average review score; show reviewed-order count | PRD §5 | apps/api | P3 | Ascending exception documented |
| FR6 | "electronics" → resolve via English category translation, query canonical category | PRD §5 | apps/api | P3 | Portuguese → English translation join |
| FR7 | No date range → full dataset; explicit assumption stated | PRD §5 | apps/api | P3 | Assumption disclosed in response |
| FR8 | Dates default to order_purchase_timestamp cohorts | PRD §5 | apps/api | P3 | Start-inclusive, next-day-end-exclusive |
| FR9 | Invalid/inverted dates rejected | PRD §5 | apps/api | P3 | Error response for invalid date range |

## MCP Tools

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| T1 | dataset_metadata tool: date extent, category lookup, dimensions, data version | Architecture §5 | apps/mcp | P2 | Returns valid structuredContent per outputSchema |
| T2 | order_trends tool: month, revenue, orders, delivery summary | Architecture §5 | apps/mcp | P2 | Monthly aggregation correct |
| T3 | category_performance tool: category/product, revenue, orders, freight, review proxy | Architecture §5 | apps/mcp | P2 | Category translation applied |
| T4 | seller_performance tool: seller, revenue, orders, review, delivery, location | Architecture §5 | apps/mcp | P2 | Seller ranking correct |
| T5 | review_analysis tool: score/category/month/seller/state; count, mean, response interval | Architecture §5 | apps/mcp | P2 | Score distribution correct |
| T6 | payment_breakdown tool: payment_type/installments/month; value, count, orders | Architecture §5 | apps/mcp | P2 | Payment composition correct |
| T7 | delivery_performance tool: month/seller/state/route; duration, delay, late rate | Architecture §5 | apps/mcp | P2 | Delay/late rate correct |
| T8 | All tools return outputSchema + structuredContent (validated) | Architecture §5 | apps/mcp | P2 | SDK validates structuredContent against outputSchema |
| T9 | Tool errors return isError: true with structured error, not success-shaped content | Architecture §5 | apps/mcp | P2 | Error envelope test |
| T10 | Structured error normalization in API client adapter | Architecture §5 | apps/api | P2 | SDK validation errors normalized to app error contract |

## MCP Protocol

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| P1 | Server uses serveStdio(createAnalyticsServer, { legacy: 'reject' }) | Corrected | apps/mcp | P1 | Server starts, modern-only |
| P2 | Client uses versionNegotiation: { mode: { pin: '2026-07-28' } } | Corrected | apps/api | P1 | Protocol era is 'modern' |
| P3 | stdout reserved for MCP protocol; all diagnostics to stderr | Corrected | apps/mcp | P1 | No console.log in MCP process |
| P4 | Seven tools registered with outputSchema | Corrected | apps/mcp | P2 | listTools returns 7 tools with outputSchema |
| P5 | Protocol integration test proves era + tools + outputSchema | Corrected | tests/integration | P2 | getProtocolEra() === 'modern', 7 tools, outputSchema present |
| P6 | MCP child lifecycle: API-startup init, single-child mutex, bounded restart | Corrected | apps/api | P1 | One child process; readiness gates /api/ready |

## Agent

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| A1 | ILLMAgent interface: run({question, requestId, signal}) → AgentResult | Architecture §6 | apps/api | P3 | Contract test |
| A2 | NativeLLMAgent: native tool calls, bounded turns, deadline | Architecture §6 | apps/api | P4 | Mock provider test |
| A3 | RuleBasedAgent: keyword templates, real MCP calls, bar-only charts | Architecture §6 | apps/api | P3 | Q1-Q10 without API key |
| A4 | AGENT_MODE=llm\|fallback; factory creates configured agent | Architecture §6 | apps/api | P3 | Mode switching test |
| A5 | Auto-fallback on model failure/timeout; disclose actual mode/reason | Architecture §6 | apps/api | P4 | Timeout fallback test |
| A6 | Bounded tool-call loop: max 4 turns / 8 tool calls, deadline | Architecture §6 | apps/api | P4 | Loop bound test |
| A7 | ExecutablePlan: versioned intent + filters + tool nodes + merge recipe | Architecture §6 | packages/contracts | P3 | Zod validation |
| A8 | Dynamic plans retain dynamic semantics on refresh (Q7 re-ranks) | Architecture §6 | apps/api | P5 | Refresh re-binds fresh IDs |

## Charts

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| C1 | Line: single metric over time | PRD §7 | apps/api | P3 | Shape assertion |
| C2 | Dual-axis line: two metrics with separate y-axes | PRD §7 | apps/api | P3 | Shape assertion |
| C3 | Horizontal bar: ranked list, descending | PRD §7 | apps/api | P3 | Shape assertion |
| C4 | Vertical bar: category comparison in one period | PRD §7 | apps/api | P3 | Shape assertion |
| C5 | Doughnut: payment composition | PRD §7 | apps/api | P3 | Shape assertion |
| C6 | Scatter: two continuous values per entity | PRD §7 | apps/api | P3 | Shape assertion |
| C7 | Stacked horizontal bar: 1-5 score distribution | PRD §7 | apps/api | P3 | Shape assertion |
| C8 | Fallback: every successful chart is bar type | PRD §7 | apps/api | P3 | All fallback = bar |
| C9 | Two options for genuinely ambiguous shapes; pin stores chosen option | PRD §7 | apps/api | P3 | Option selection persisted |
| C10 | Backend owns Chart.js config; no eval/callbacks/functions in serialized config | Architecture §7 | apps/api | P3 | Security review |
| C11 | chart_options stored as array in snapshot; chosen_chart_option on pin | Corrected | apps/api | P5 | Array storage test |

## Persistence

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| PE1 | app.analyses: analysis_id PK, question, plan, agent metadata, timestamps | Corrected | apps/api | P5 | Analysis round-trip |
| PE2 | app.analysis_snapshots: snapshot_id PK, analysis_id FK, data, chart_options[], insight | Corrected | apps/api | P5 | Snapshot round-trip |
| PE3 | app.pins: pin_id, analysis_id FK, latest_snapshot_id FK, chosen_chart_option, plan_version | Corrected | apps/api | P5 | Pin round-trip |
| PE4 | app.refresh_runs: pin FK, previous/new snapshot FKs, status, diff, timestamps | Corrected | apps/api | P5 | Refresh history |
| PE5 | Refresh loads executable_plan through analysis record, not from pin | Corrected | apps/api | P5 | Plan loaded from analysis |
| PE6 | pins.latest_snapshot_id only points to COMPLETE successful snapshot | Corrected | apps/api | P5 | Invariant enforced |
| PE7 | Failed/partial refresh never becomes latest successful pin snapshot | Corrected | apps/api | P5 | Failure preservation |
| PE8 | Atomic compare-and-swap via plan_version for concurrent refresh | Corrected | apps/api | P5 | Race condition test |
| PE9 | Pin survives browser and container restart | PRD §2 | apps/api | P5 | Compose restart test |

## Semantic Diff

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| SD1 | Compare by (dimension_key, metric_id), not colors/order/wording | Architecture §9 | apps/api | P5 | Key-based comparison |
| SD2 | Revenue thresholds: ≥10% relative AND ≥BRL 100 absolute | Architecture §9 | apps/api | P5 | Threshold test |
| SD3 | Score threshold: ≥0.2 stars; duration: ≥1 day; rates: ≥5pp | Architecture §9 | apps/api | P5 | Threshold test |
| SD4 | Zero-to-nonzero: absolute threshold; percentage change is null | Architecture §9 | apps/api | P5 | Edge case test |
| SD5 | Structural changes (added/removed entity, ranking change) flagged | Architecture §9 | apps/api | P5 | Structural change test |
| SD6 | Status: unchanged|changed|not_comparable|failed | Architecture §9 | apps/api | P5 | Status values test |
| SD7 | Coverage change / incompatible versions → not_comparable | Architecture §9 | apps/api | P5 | Incomparable test |

## UI

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| U1 | Explore page: query composer, submit, sample suggestions | Design.md | apps/web | P5/P6 | Keyboard submit |
| U2 | Result card: question, mode, chart, insight, assumptions, pin action | Design.md | apps/web | P5/P6 | All elements present |
| U3 | Dashboard: responsive card grid, refresh, remove | Design.md | apps/web | P5/P6 | Responsive layout |
| U4 | Chart.js rendering via react-chartjs-2 | Design.md | apps/web | P5/P6 | Canvas present |
| U5 | Morphicons for pin/refresh state transitions | Design.md | apps/web | P6 | Icon transitions |
| U6 | theSVG PostgreSQL brand in About/technology area | Design.md | apps/web | P6 | Attribution present |
| U7 | 390px / 768px / 1440px responsive, no overflow | Design.md | apps/web | P6 | Viewport tests |
| U8 | Keyboard navigation, focus management, reduced motion | Design.md | apps/web | P6 | Accessibility test |
| U9 | Loading/error/empty/partial/failure states | Design.md | apps/web | P6 | State coverage |

## Guardrails

| ID | Requirement | Source | Component | Phase | Acceptance Test |
|----|-------------|--------|-----------|-------|-----------------|
| G1 | Unsupported question → chart=null, clear message | PRD §9 | apps/api | P3 | Unknown query test |
| G2 | Empty valid filter → no chart, filter explanation | PRD §9 | apps/api | P3 | Empty result test |
| G3 | Tool timeout → preserve usable partial result, name failures | PRD §9 | apps/api | P4 | Timeout test |
| G4 | No fabricated source data, test results, installs, model IDs | Rules.md | all | all | Code review |
| G5 | No SQL execution exposed as LLM tool | Rules.md | apps/api | P3 | Security review |
| G6 | Request length cap 2,000 characters | Architecture §5 | apps/api | P3 | Overflow test |
| G7 | No uncaught expected errors; no stack traces in responses | Rules.md | apps/api | P3 | Error handling test |
| G8 | Log request ID, timings, tool names, status, data version | Rules.md | apps/api | P3 | Logging test |

## Regression Cases (from Phases.md)

| Case | Description | Phases |
|------|-------------|--------|
| R1 | Date phrase: last year, half-year, no range, invalid range, outside-data range | P3 |
| R2 | Seller SP vs destination SP, accent normalization, top-N ties, worst-score ascending | P3 |
| R3 | Multi-item/multi-payment order, repeated review, duplicate geolocation, untranslated category | P2 |
| R4 | Missing delivery/review, zero-to-nonzero diff, null-to-value, added/removed entity, changed ranking | P5 |
| R5 | One failed independent tool, failed dependency, overall timeout, provider down | P4 |
| R6 | SDK invalid arguments, MCP child restart | P2, P4 |
| R7 | Chart ambiguity with selection saved to pin, invalid chart JSON, multiple units, zero score bins | P3 |
| R8 | API/database restart, concurrent refresh, failed import, incomplete refresh preserving snapshot | P5 |

## Final Validation

| Requirement | Test | Evidence |
|-------------|------|----------|
| Clean start | Clean-start test | 7/7 pass |
| No secrets | Security audit | 6/6 pass |
| Pin persistence | Pin lifecycle verification | 7 stages verified |
| Q1-Q10 criteria | Acceptance matrix | 10/10 pass |
| Source manifest | docs/evidence/source-manifest.md | Created |
| Evidence index | docs/evidence/README.md | Created |
