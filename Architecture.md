# Architecture — Olist Analytics Studio

## 1. Stack decision
Proposed stack: TypeScript strict mode across Node backend and React frontend; Fastify API; PostgreSQL with parameterized SQL through pg; React + Vite + Tailwind CSS + shadcn/ui; Chart.js via react-chartjs-2; Zod for runtime contracts; Vitest for unit/integration tests; Playwright for browser flows; pnpm workspace and Docker Compose.
Use the official MCP TypeScript SDK v2 packages: `@modelcontextprotocol/server` (MCP server) and `@modelcontextprotocol/client` (MCP client). The server uses `serveStdio()` from `@modelcontextprotocol/server/stdio` (without `{ legacy: 'reject' }` — that option causes protocol negotiation failures in the runtime). The client uses `StdioClientTransport` from `@modelcontextprotocol/client/stdio` (without `versionNegotiation` pin — the default negotiated version is `2025-11-25`). Zod v4 is used for tool schemas (Standard Schema compatible with MCP v2). Pin exact resolved package versions and a lockfile during implementation.
Use Anthropic's official SDK for the first provider adapter, with native tool use, ANTHROPIC_API_KEY and configurable LLM_MODEL. Verify an available tool-capable model and commit a tested default; do not invent an ID or require the evaluator to select a model. Avoid an agent framework for this bounded loop.
Pin exact resolved package versions and a lockfile during implementation. No speculative version numbers are locked by this planning document.

## 2. Runtime boundaries
Browser -> same-origin Fastify API -> ILLMAgent -> MCP client -> official MCP server -> read-only analytics SQL.
The API also writes analysis/pin snapshots to the application schema. The browser never accesses the database or LLM provider.

Compose services:
- db: PostgreSQL, persistent named volume, pg_isready health check.
- init: one-shot downloader/importer/migrator. Wait for healthy db, download dataset anonymously via HTTP (no credentials required), import atomically and exit 0 only after validation.
- api: waits for successful init. Serves built React assets and API on one local port. On boot, spawns exactly one supervised stdio MCP child using `StdioClientTransport` (negotiated protocol 2025-11-25; the child receives DATABASE_URL and timeout env vars explicitly because SDK v2 inherits only a safe env allowlist). Readiness requires both DB and MCP child ready; `/api/ready` returns 200 only after MCP child lists tools successfully.

MCP child lifecycle:
- Start: API boot spawns one child via `StdioClientTransport`
- Protocol: client uses default `StdioClientTransport` (negotiates `2025-11-25`). Server uses `serveStdio(factory)` without `{ legacy: 'reject' }` (that option causes negotiation failures). The negotiated protocol is `2025-11-25`.
- Readiness: `client.listTools()` succeeds → child ready → `/api/ready` returns 200
- Per-call timeout: 5 seconds per tool call
- Unexpected close: bounded restart with exponential backoff (1s, 2s, 4s, max 3 retries), then readiness goes false
- Shutdown: API SIGTERM handler calls `client.close()` → kills child process
- Mutex: single-child state machine prevents duplicate children
- Stdio discipline: stdout reserved exclusively for MCP protocol traffic; all diagnostics/logging go to stderr; no `console.log()` from MCP process

The MCP source is a separate app/package compiled to `apps/mcp/dist/server.js` and launched as a child process within the API container. No fake MCP implemented as a renamed local function.

## 3. Source structure
All paths below are relative to repository root; these are planned paths, not pre-created empty files.

| Path | Responsibility |
| --- | --- |
| PRD.md, Architecture.md, Rules.md, Phases.md, Design.md | authoritative planning documents |
| Memory.md | created after first implementation task; current work state |
| apps/api/src/server.ts | Fastify lifecycle and static frontend serving |
| apps/api/src/routes/ | health, analyses, pins routes |
| apps/api/src/agents/ | ILLMAgent, native agent, fallback agent, factory, supervision |
| apps/api/src/analysis/ | normalization, plan execution, keyed merge, insight, charts, diff |
| apps/api/src/mcp/client.ts | official MCP client with StdioClientTransport and versionNegotiation |
| apps/api/src/mcp/child.ts | MCP child process lifecycle manager (start, readiness, restart, shutdown) |
| apps/api/src/repositories/ | analysis snapshots, pins, refresh persistence |
| apps/mcp/src/server.ts | protocol registration and lifecycle |
| apps/mcp/src/tools/ | metadata and six domain tool handlers |
| apps/mcp/src/queries/ | allowlisted parameterized analytical SQL |
| apps/ingest/src/ | archive acquisition, safe CSV loading, validation, fingerprints |
| apps/web/src/pages/ | ExplorePage, DashboardPage |
| apps/web/src/features/analysis/ | composer, result card, assumptions, table, option chooser |
| apps/web/src/features/dashboard/ | pin cards, refresh states, diff view |
| apps/web/src/components/ui/ | generated shadcn primitives |
| apps/web/src/components/icons/ | application icon adapter and Morphicons wrapper |
| apps/web/src/styles/ | theme tokens and global styles |
| apps/web/public/brands/ | reviewed static theSVG assets |
| packages/contracts/src/ | Zod schemas and inferred types; no DB/provider dependencies |
| migrations/ | raw, analytics and app schema SQL migrations (executed by ingest app, not a workspace package) |
| tests/fixtures/ | small purpose-built Olist-shaped CSVs, explicitly synthetic |
| tests/integration/ | protocol, SQL, lifecycle and provider-adapter tests |
| tests/e2e/ | actual browser query/pin/restart/refresh flows |
| docs/ | metric dictionary, source/license ledger, validation evidence |
| compose.yaml, Dockerfile, .env.example | reproducible runtime |
| pnpm-workspace.yaml, package.json, pnpm-lock.yaml | commands and dependencies |

Dependency direction: web -> contracts; API -> contracts and app persistence; MCP -> contracts and analytics SQL; ingest -> db migrations/import; neither MCP nor ingest imports API routes. Shared packages must not become a miscellaneous utility bin.

## 4. Data ingestion and joins
Discover nine expected CSVs: orders, customers, order_items, order_payments, order_reviews, products, sellers, geolocation, product_category_name_translation. Validate file names, headers, source hashes and types; preserve source names in raw schema. Ignore no required file. Unknown extra CSVs receive a manifest entry and explicit treatment.
Use streaming CSV parsing and database COPY/parameterized batches, not full-file JSON loads. Preserve ZIP prefix leading zeros, decimal currency and nullable timestamps. Reject corrupt input with actionable diagnostics. Import into staging inside a transaction; validate before replacing active analytics data. Existing pins are never deleted by import. Use a database advisory lock to prevent parallel initializers.
Store dataset_versions with source identifier, source/version URL, file checksums, row counts, imported_at and purchase-date extent. If checksums and migration version match, skip repeat import. A failed import leaves the prior data version available. Each multi-tool analysis is bound to one active dataset version; block activation during a plan or retry the plan on version change so it never mixes versions.

Analytical foundations:
- items_by_order: one row per order for merchandise and freight totals.
- payments_by_order: one row per order when joining order-level measures; keep payment lines separate for payment-type aggregation.
- canonical_reviews: one row per order under PRD deduplication.
- order_categories and order_sellers: distinct bridges to avoid repeated review contributions within a group.
- geolocation_by_prefix: deterministic aggregate with one row per prefix; use seller/customer state columns for state filters. Never assume raw geolocation prefix is unique.
- product queries always left join translation; unknown translations have explicit English display label “Untranslated category” and canonical source ID retained.
Never join raw items x raw payments x raw reviews and SUM the exploded rows. Monetary column NUMERIC stays precise; convert only at the chart boundary with bounded finite numbers.

## 5. Tool contract
Use seven tools: dataset_metadata, order_trends, category_performance, seller_performance, review_analysis, payment_breakdown, delivery_performance. Each has a narrow validated input schema (Zod v4) and a validated output schema (`outputSchema`). Tool outputs use `structuredContent` for machine-validated data and `content` for human-readable text.

Common supported filters: from/to, allowed status/cohort, category IDs, seller/customer state, entity ID lists; tool-specific enums define group_by, metric, sort_by, sort_order and limit. Reject unknown fields. Default ranked display limit 10, maximum 100; maximum chart rows 500. Aggregation must happen before display limits. Reject or explicitly summarize oversized scatter results; never silently sample correlation.

| Tool | Grouping/measures needed |
| --- | --- |
| dataset_metadata | date extent, English category lookup, permitted dimensions, data version |
| order_trends | month; item revenue, distinct orders, delivery summary |
| category_performance | category/product; revenue, distinct orders, freight, order-review proxy |
| seller_performance | seller; revenue, order count, review proxy, delivery duration, location |
| review_analysis | score/category/month/seller/customer_state; count, mean, response interval; optional status filter for common-cohort comparisons |
| payment_breakdown | payment_type/installments/month; value, line count, distinct orders |
| delivery_performance | month/seller/customer_state/seller_state/route; duration, delay, late/on-time rate, denominators |

Define matching_cohort='delivered_reviewed_valid_delivery' for Q9/Q10 and enforce the identical order eligibility in both tools. Route grouping uses distinct order/seller-state/customer-state so item duplicates cannot inflate route denominators. State default means destination customer state except seller-specific questions.

Tool output envelope (every tool, via outputSchema):
- columns: Array<{ name: string; type: string; unit?: string }>
- rows: Array<Record<string, unknown>>
- grain: string (e.g. "order_id", "order_id × category_id")
- units: Record<string, string> (e.g. { revenue: "BRL", orders: "count" })
- filters: Record<string, unknown> (applied filter values)
- cohort: string (e.g. "delivered", "all_statuses")
- dataVersion: string (SHA-256 of imported data)
- rowCount: number
- excludedCount: number (rows excluded by cohort/validity rules)

Success: validated structuredContent satisfies outputSchema; content block contains JSON.stringify(structuredContent) for human readability.
Error: `isError: true` with a structured error representation (code, message, retryable, tool); must not emit structuredContent that violates the success output schema. SDK validation/protocol errors are caught and normalized at the MCP client adapter into the application error contract.
Codes: INVALID_INPUT, EMPTY_RESULT, QUERY_TIMEOUT, DATABASE_ERROR, DATA_UNAVAILABLE, DATA_VERSION_CONFLICT, INTERNAL_ERROR.

## 6. Agent and plan contracts
ILLMAgent.run({question,requestId,signal}): Promise<AgentResult>. NativeLLMAgent and RuleBasedAgent implement the same interface. Factory creates the configured agent; ResilientAgent handles automatic fallback. Routes know only ILLMAgent.
AgentResult fields: status=success|partial|empty|unsupported|needs_clarification|error; analysisId; originalQuestion; actualMode=llm|fallback; fallbackReason?; resolvedFilters; assumptions; normalizedData; chartOptions (array of validated Chart.js configs); chartType; chartReason; insight; warnings; sources; dataVersion; executablePlan. Error/no-data responses have chartOptions=[]. Persist only bounded serializable objects.
ExecutablePlan: versioned intent + canonical filters + cohort + tool nodes with dependency IDs and parameter bindings + keyed merge recipe + selected chart semantics. No executable code. Dynamic plans must retain dynamic semantics: Q7 refresh re-ranks top five categories and binds those fresh IDs into its second tool, not the original five frozen IDs.

Analytics hallucination boundary — the deterministic application pipeline owns all numeric facts:
- Intent resolution: LLM (or keywords) understands question, extracts filters
- Filter normalization: deterministic code resolves date phrases, state codes, top-N
- Tool selection: LLM (or templates) chooses which MCP tools to call
- ExecutablePlan: deterministic code serializes plan with tool bindings
- SQL execution: MCP tools run parameterized queries
- Numeric aggregation: deterministic code in MCP tools (never LLM)
- Keyed merge: deterministic code joins tool outputs by shared keys
- Ranking/sorting: deterministic code (never LLM)
- Chart.js config: deterministic code generates config from validated rows (never model-generated)
- Chart validation: deterministic code enforces shape rules
- Insight generation: deterministic template; LLM may suggest phrasing but numeric claims verified against tool output before returning
- Refresh diff: deterministic semantic comparison by (dimension_key, metric_id)

Native path: normalize deterministic phrases -> supply tool definitions to provider -> receive native tool-use blocks -> validate arguments -> execute actual MCP calls -> return tool-result blocks -> continue up to four model turns/eight tool calls -> deterministic keyed merge -> deterministic chart builder -> grounded insight. Allow one bounded correction for invalid arguments if within deadline. Tool output and any review text are untrusted data, never instructions. Do not send raw reviews/customers to the model when aggregates suffice.
Fallback path: shared normalizer -> supported keyword intents and explicit multi-tool templates -> same MCP executor -> same merge/metric logic -> bar-only builder -> deterministic insight. Cover all ten supplied prompts and documented synonyms. Unknown queries receive a supported-domain message. Do not pretend keyword routing is general language understanding.
Timeout defaults (configurable): overall 45 seconds, model stage at most 25 seconds, each tool at most 5 seconds, reserved fallback budget 10 seconds. Clamp nested deadlines to remaining overall time. Abort real network/SQL operations; Promise.race alone is insufficient. Parallel independent tools use allSettled-style collection; dependent tools wait for prerequisites. No model fallback for ordinary empty data. Preserve successful tool outputs when later calls fail; missing dimensions must not be invented.
Insight: one factual sentence computed from the returned aggregates. The model may suggest phrasing, but numerical claims must be verified or replaced by a deterministic template. Never infer causality from Q9.

## 7. Chart config boundary
Backend owns Chart.js config generation from validated rows, not arbitrary model-generated JavaScript. JSON-only types: line, bar, doughnut, scatter. Allowlist options, scale IDs, datasets and units; no callbacks, eval, plugin code, HTML or functions. Client adds trusted formatting functions locally.
Each analysis snapshot stores `chart_options` as an array (1-2 entries) of validated Chart.js configurations. When a question has genuinely ambiguous visualization (e.g., two suitable chart shapes), the system presents options and the pin stores `chosen_chart_option` as the selected index. All chart configurations remain deterministic and generated by application code — never by the model.
For score distribution use indexAxis=y and stacked=true on both scales, with a dataset for each score and a total cohort row. Missing scores become zero counts; missing average ratings remain null. Calendar axes fill missing count/revenue months with zero only where calendar coverage is known; missing means stay null. Ranked labels keep stable IDs in source metadata. Keep full underlying table available for accessibility.

## 8. API and persistence
| Endpoint | Contract |
| --- | --- |
| GET /api/health | liveness |
| GET /api/ready | database/data version/MCP readiness (MCP child must be connected and tools listed), no secrets |
| POST /api/analyses | validated question -> AgentResult and persisted analysis_id |
| POST /api/pins | {analysis_id, chartOptionId?, title?}; server retrieves trusted saved analysis result |
| GET /api/pins | persisted cards and last refresh status |
| POST /api/pins/:id/refresh | rerun stored executablePlan from associated analysis, including dependency bindings |
| DELETE /api/pins/:id | remove pin, predictable missing-ID behavior |

Persistence model (four tables):

app.analyses — immutable analysis entity:
- analysis_id UUID PK
- original_question TEXT
- executable_plan JSONB (versioned plan with tool bindings)
- agent_mode TEXT (llm|fallback)
- created_at TIMESTAMPTZ

app.analysis_snapshots — immutable snapshot of execution results:
- snapshot_id UUID PK
- analysis_id FK → analyses
- data_version TEXT (SHA-256 of imported data)
- resolved_filters JSONB
- assumptions TEXT[]
- data_snapshot JSONB ({ columns, rows })
- chart_options JSONB (array of validated Chart.js configs; may contain 1-2 options)
- insight TEXT
- warnings TEXT[]
- status TEXT (success|partial|empty|unsupported|error)
- created_at TIMESTAMPTZ

app.pins — analyst-pinned analyses:
- pin_id UUID PK
- analysis_id FK → analyses
- latest_snapshot_id FK → analysis_snapshots (invariant: must point to a COMPLETE successful snapshot)
- chosen_chart_option INT DEFAULT 0 (index into snapshot's chart_options array)
- plan_version INT DEFAULT 1 (optimistic concurrency control)
- title TEXT
- created_at TIMESTAMPTZ
- updated_at TIMESTAMPTZ

app.refresh_runs — refresh attempt history:
- refresh_id UUID PK
- pin_id FK → pins
- previous_snapshot_id FK → analysis_snapshots
- new_snapshot_id FK → analysis_snapshots (null if failed)
- status TEXT (success|partial|failed|not_comparable)
- semantic_diff JSONB (per-metric diffs, null if not_comparable/failed)
- failure_reason TEXT
- started_at TIMESTAMPTZ
- completed_at TIMESTAMPTZ

Refresh behavior:
- Refresh loads executable_plan through the analysis record (via analysis_id FK), not from a pin column.
- Refresh executes against the CURRENT active data version (not the snapshot's original version).
- Atomic compare-and-swap via plan_version: UPDATE pins SET latest_snapshot_id = new_id, plan_version = plan_version + 1 WHERE pin_id = X AND plan_version = current_version. If CAS fails, reject (concurrent refresh won).
- pins.latest_snapshot_id can only point to a COMPLETE successful snapshot. Failed/partial refreshes are stored in refresh_runs but never become the latest pin snapshot.
- Preserve original relative-date policy and cohort. When plan schema or metric version changes, report not_comparable.
- Existing pins are never deleted by data import.

## 9. Significant-change algorithm
Compare normalized values by stable (dimension key, metric ID), not Chart.js JSON, colors, row order or wording. Sort keys and use deterministic numeric precision. Proposed thresholds are product decisions, not statistical significance:
- Revenue, counts, freight/payment totals: >=10% relative change AND absolute change >= BRL 100 for monetary totals or >=5 for counts.
- Mean score: >=0.2 stars; duration/delay: >=1 day; rates/shares: >=5 percentage points; average freight: >=BRL 5.
- Previous zero to nonzero: use absolute threshold; percentage change is null and describe “from zero.”
- Added/removed entity or top-N membership change: structural change flagged independently.
- Missing/null is not zero. Coverage change, incompatible metric versions or partial refresh => not comparable, with explanation.
Return per-metric old/new/absolute/relative changes, threshold reason, structural differences and an overall status: unchanged|changed|not_comparable|failed. Compare the current result against the prior successfully comparable refresh; store both. Permit successful below-threshold updates while labeling “No significant change.” A change can be significant even if totals cancel out.

## 10. Reproducibility gate
Dataset provisioning: verified anonymous HTTP download from `https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce` (returns 302→200, application/zip, ~44.7 MB, no credentials required). The init container downloads via `curl -L` with timeout, bounded retries, redirect handling, and non-2xx failure detection. Validates ZIP signature, extracts 9 CSVs, verifies expected filenames/headers, computes SHA-256 checksums, and imports transactionally. Idempotent: checksum match skips re-import. Failed import leaves prior data available.
Final .env.example includes AGENT_MODE, ANTHROPIC_API_KEY, tested LLM_MODEL default, deadlines, row limits and documented internal database defaults. A missing API key must still allow startup and disclosed fallback. No global Node/Python or manual migration needed outside Docker. Record actual first-run network requirements and evidence from clean volumes.

## 11. Primary references
- Assignment: supplied PDF, pages 1–6.
- Dataset: https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce (anonymous HTTP download verified: no credentials required)
- MCP SDK v2: https://github.com/modelcontextprotocol/typescript-sdk (main branch is v2; `@modelcontextprotocol/server` + `@modelcontextprotocol/client`)
- MCP v2 tools docs: https://ts.sdk.modelcontextprotocol.io/v2/servers/tools.html (outputSchema + structuredContent)
- MCP v2 protocol versions: https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions.html (serveStdio, versionNegotiation)
- Native tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Chart.js: https://www.chartjs.org/docs/latest/ and https://www.chartjs.org/docs/latest/charts/scatter.html
- Compose startup: https://docs.docker.com/compose/how-tos/startup-order/
- shadcn Vite setup: https://ui.shadcn.com/docs/installation/vite
These resources were consulted on 2026-09-06. Exact install APIs must be checked against versions selected by the implementing agent.
