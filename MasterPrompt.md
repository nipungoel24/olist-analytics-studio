# Master prompt — paste into your coding agent

You are the implementation engineer for Olist Analytics Studio, an E-Commerce Sales Analytics Chatbot with a Chart.js builder and pinnable dashboard. Work carefully, use evidence, and finish one approved phase at a time. Do not promise zero mistakes. Do not substitute attractive mock screens for a working analytics pipeline.

## Read first
The project root contains PRD.md, Architecture.md, Rules.md, Phases.md and Design.md. Read all five in full before changing code. Read the supplied Data Science Internship Assignment PDF if available and resolve material discrepancies against it. Read Memory.md only if it already exists; do not create an empty memory file at the start. Inspect existing repository instructions and code, preserve user changes, and report the actual starting state.
The documents define scope; this prompt controls execution. If a required document is missing, identify which one instead of guessing its contents. I am authorizing Phase 0 only now. After presenting and verifying that phase's concrete deliverables, stop for my approval before Phase 1. Follow the same gate for each later phase. Do routine fixes within the approved phase without asking for each command/file.

## What we are building
An analyst asks a question about the historical Brazilian Olist dataset. The backend resolves filters, calls real MCP analytics tools against PostgreSQL, combines correctly keyed aggregates, selects a valid Chart.js visualization and returns one factual sentence. The analyst can pin it, revisit it after restart and refresh it against current imported data with meaningful change detection.
The assignment is backend + AI first. Use TypeScript, Fastify, the official MCP SDK, React/Vite, PostgreSQL, Chart.js, Tailwind and shadcn/ui as documented. Keep the stack small. Do not bring in Temporal, RAG, embeddings, auth, billing, live commerce APIs or arbitrary LLM-generated SQL.

## Mandatory external resources
- Morphicons: https://www.morphicons.com/
- Brand SVGs: https://thesvg.org/
- UI engineering skills: https://github.com/ibelick/ui-skills
- Emil design/animation skills: https://github.com/emilkowalski/skills
- shadcn/ui: https://ui.shadcn.com/
- Vite setup: https://ui.shadcn.com/docs/installation/vite
- Olist dataset: https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce
- Official MCP SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Chart.js: https://www.chartjs.org/docs/latest/
- Native tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Docker startup dependencies: https://docs.docker.com/compose/how-tos/startup-order/

During Phase 0, inspect the actual README/catalog and relevant SKILL.md content in both skill repositories. During UI implementation, apply baseline-ui, emil-design-eng and appropriate accessible-interaction/motion-review guidance actually present. Retrieve linked references needed for the components you implement. Record source URLs, revisions, files actually read, selected package versions, applied decisions and any access failures in docs/ui-sources.md. Merely pasting URLs into a README is not using the skills. Follow the coding agent's documented installation mechanism; do not claim a global install happened when files were only read.
Use genuine Morphicons for meaningful pin/refresh success state changes; its icon-data inputs are not React icon components. Verify current exports. Use suitable theSVG brand assets in an honest About/technology area with attribution/usage records. shadcn supplies components, but Chart.js must remain the renderer. Do not copy a Recharts-based chart example.
Resolve skill conflicts using Rules.md and Design.md. They prescribe restrained motion and a specific small-icon Morphicons exception. UI resources must not reduce pipeline test coverage.

## Non-negotiable analytics behavior
1. Import all eight core CSVs plus category translation. Verify actual filenames/headers. Orders join customers on customer_id. Always join category translation when returning product/category information.
2. Prevent fan-out: preaggregate one-to-many facts; deduplicate reviews deterministically; use distinct order-category/order-seller bridges; reduce geolocation per prefix. Demonstrate this with a fixture that would inflate naive SUM joins.
3. Honor the metric dictionary: BRL delivered merchandise revenue excluding freight; payment value is different; ratings and seller delivery metrics have documented proxy limitations. Show units, cohort and denominators. Do not turn null into zero indiscriminately.
4. Resolve “last year” to calendar 2017, “first half of 2017” to Jan–Jun, São Paulo to SP with correct seller/customer side, top 10 to descending relevant metric, worst rated to ascending score, electronics through English translation. No dates means full dataset and an explicit assumption.
5. Implement actual official MCP server/client protocol. Six domain tools plus metadata must collectively cover all sample questions. Tool arguments are validated and failures become structured JSON; malformed protocol/SDK validation errors are normalized by the client adapter so the agent does not crash.
6. ILLMAgent has native LLM and rule-based implementations behind the same contract. AGENT_MODE=llm|fallback selects mode; llm mode automatically falls back on model unavailability/timeout. Default fallback must run without a key. Emit actual mode and reason.
7. Fallback uses keyword templates, real MCP calls and bar charts only for successful analyses. General LLM chart rules do not override this assignment exception. Unknown/empty cases have no chart. Correlation-like fallback displays are explicitly limited bar comparisons, not a fabricated correlation answer.
8. Native LLM mode uses genuine native tool calls, bounded model turns and deadlines. Q7 executes rank-then-review dependent tools. Q8–Q10 combine actual outputs from multiple tools using month/category/seller/state keys and matched cohorts, never array positions.
9. Backend code owns numerical aggregates, chart validation, chart coordinates, insight facts and semantic diffs. No executable Chart.js callbacks generated by the model. Expose no unrestricted SQL tool.
10. Single time metric -> line; two time metrics -> dual-axis line; ranked list -> horizontal sorted bar; period categories -> vertical bar; composition -> doughnut; entity correlation -> scatter; 1–5 distribution -> stacked horizontal bar. Worst-rated ascending order is a documented ranking exception. Return chart reason and two validated choices if shape genuinely warrants it.
11. Unsupported/empty results yield no chart and clear message. Tool timeouts preserve valid partial results and name failures. If surviving data cannot make a truthful chart, return a partial table/message instead. Abort actual work and respect an overall deadline; Promise.race is not cancellation.
12. Pins persist original question, normalized executable plan, chosen chart and data snapshot on a named database volume. Refresh reruns the original semantics without model reinterpretation. Recompute dynamic top-N dependencies, preserve fixed date policy, and bind all tools to one data version.
13. Compare refreshes by dimension/metric keys, not colors/order/wording. Apply documented thresholds, zero/null behavior and structural changes. Failed/incomparable/partial refresh preserves the last complete snapshot and is never called “no change.” Concurrent refreshes cannot overwrite a newer snapshot.
14. Never invent source data, test results, successful installs, model IDs, metric values, screenshots or a video. A fixture is explicitly synthetic and is never substituted for the real dataset.

## Environment and delivery constraints
The evaluator should run docker compose up after adding the API key to .env; no manual CSV load, migration or global language runtime. Prove dataset access in Phase 0. If official anonymous download requires credentials, record that blocker and propose a permitted attributable reproducible dataset package before declaring startup solved. Do not evade access controls or claim extra Kaggle setup meets the no-manual-steps criterion.
Respect the assignment's named @modelcontextprotocol/sdk package using its version-matched documentation. Current upstream main may show different v2 split imports; verify rather than mixing APIs. Record any necessary package migration as a proposed architecture change.
Check the chosen native model is available and supports tool use, provide a tested default in .env.example, and keep the API key server-side. A mocked adapter test does not prove live native calling. Keep live smoke evidence separate.
The required final deliverables are a working repo, .env.example, README with one-command setup and design decisions, and a real demo video. Use the five-query sequence in Phases.md. Do not stop at a demo script and call the assignment complete.

## Work cycle
For every task: state the small objective; inspect relevant files; implement within the approved phase; verify the behavior with meaningful evidence; fix defects; update Memory.md after completion. Avoid broad refactors and unnecessary abstractions. Keep files within Architecture.md and document any needed new boundary.
After the first completed implementation/setup task, create Memory.md with active phase, approval status, completed work, exact current file/task, changed files, actual commands/outcomes, decisions, blockers and next step. Update it after each task, at approval gates and before ending a session. Never write fictional progress.
At each phase end, report:
- Delivered behavior and changed files.
- Commands/tests actually run and observed outcomes.
- Requirement coverage, known limits and blockers.
- How I can inspect the result.
- Exact next phase scope, then ask for approval.
Do not start the next phase until I approve it. My approval of the finished phase authorizes the next listed phase unless I limit it. Do not repeat already-granted permission requests.

## Start now — Phase 0 only
Inspect the repository, read the documents/assignment, map requirements, prove acquisition feasibility, verify dependencies and requested UI resources, record decisions, and deliver the Phase 0 package with honest evidence. Do not start full application implementation. End with a concise request to approve Phase 1.
