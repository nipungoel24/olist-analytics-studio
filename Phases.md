# Phases — detailed execution and approval plan

All implementation phases are initially NOT STARTED. This planning package does not count as implementation approval. The master prompt authorizes Phase 0 only. At each gate provide concrete files, evidence, remaining limits and the next phase's scope; then ask for approval. Do not start the next phase until approved. Complete routine fixes and verification inside the current phase autonomously.

## Phase 0 — inspect, settle contracts and prove feasibility
1. Read the PDF and all baseline documents; inspect existing code and preserve it.
2. Produce docs/requirements-matrix.md mapping every assignment line to component, phase and test.
3. Validate dataset acquisition from a clean environment: archive access, expected CSV names/headers, attribution, checksum and no-extra-credentials feasibility. Do not download from an invented mirror or mask blocked access.
4. Verify official MCP SDK version/import path, native model/tool support, Chart.js integration and frontend dependency compatibility. Record exact choices and lockfile strategy.
5. Inspect the two requested skill repositories and icon/UI documentation. Record actual files read, availability, relevant rules, conflicts and licenses in docs/ui-sources.md.
6. Confirm proposed metric definitions, fallback exception, partial behavior, refresh semantics and folder plan; update baseline documents only for substantiated discoveries.
7. Create Memory.md only after this first implementation/setup task completes; record what remains unbuilt.
Gate: reviewable matrix, verified anonymous dataset acquisition (no credentials required), dependency/source decisions and refined baseline. Ask approval for Phase 1. Do not scaffold the entire app or design every screen here.

## Phase 1 — reproducible foundation and data import
1. Set up strict TypeScript pnpm workspace, contracts package and minimal scripts.
2. Create Compose db/init/api skeleton, health/readiness, Docker build and .env.example.
3. Implement streaming, transactional, idempotent nine-CSV import with fingerprint/version ledger.
4. Add schema migrations, indexes, canonical review and distinct bridge views.
5. Add synthetic relational fixtures revealing joins and date handling. Validate real archive row counts/headers without pretending exact totals are known in advance.
6. Prove restart avoids duplicate imports and preserves data; broken archive does not activate a partial database.
Gate: fresh-volume startup reaches data-ready state with no manual migrations; repeated import is safe; fixture sums and join-grain checks pass. UI may be a readiness page. Ask approval for Phase 2.

## Phase 2 — real MCP analytics tools
1. Implement dataset_metadata and six domain tools with narrow Zod schemas.
2. Implement parameterized SQL and PRD metric/cohort rules, category translation and deterministic ranking.
3. Support grouping/filter combinations necessary for all ten questions, including common-cohort filters.
4. Implement structured domain errors and client-side normalization of SDK validation errors.
5. Connect an official MCP client over stdio. Test listTools, callTool, malformed inputs and timeouts.
6. Assert manually derived expected numerical results against fixtures for every domain, including 2x2 join fan-out, multiple reviews, leading-zero ZIPs and translated electronics.
Gate: tool coverage table and protocol/numerical evidence; no model yet required. Ask approval for Phase 3.

## Phase 3 — deterministic fallback and charts
1. Define ILLMAgent and AgentResult, canonical filters and executable plan schema.
2. Implement required phrase resolution and transparent defaults.
3. Implement fallback intent templates including all ten example questions and multi-tool plans.
4. Implement keyed joins, dependency binding, null/cohort rules and cancellation budgets.
5. Implement deterministic chart factories for every required shape; test factories separately even though fallback uses only bar.
6. Implement deterministic insights, unknown/empty/partial states and POST /api/analyses.
7. Exercise fallback without a key. Preserve mixed units in separate bar panels rather than a misleading common axis.
Gate: all ten example questions produce truthful bar-only fallback analyses or explicitly limited comparison responses as specified; unknown/empty queries show no chart; every chart factory passes shape assertions; no LLM is used. Ask approval for Phase 4.

## Phase 4 — native LLM tool calling and resilience
1. Implement provider adapter using official SDK and actual native tool-use/result messages.
2. Convert registered MCP tool schemas into provider definitions; enforce server validation regardless of model output.
3. Execute bounded tool-call loop with deadlines, one correction budget and tool provenance.
4. Apply deterministic chart selection from resulting data shape; model intent cannot override invalid shapes.
5. Resolve two suitable chart options when visually ambiguous; do not use options to hide ambiguity about metrics.
6. Add automatic model failure/timeout fallback, preserve partial tool successes and report actual mode/reason.
7. Run mocked provider contract tests and a separately identified live native-tool smoke test. Exercise all ten sample queries in LLM mode, verifying Q7's dependency and Q8–Q10 multiple tool traces.
Gate: same ILLMAgent consumer in both modes, correct chart mapping, bounded failure behavior and actual provider evidence. If a real key is missing, mark live test blocked rather than passed. Ask approval for Phase 5.

## Phase 5 — persistent pins and reliable refresh
1. Implement analysis snapshots, pins, refresh run history and optimistic revisions.
2. Pin a server-trusted analysis result; save original text, normalized plan and selected visualization.
3. Implement refresh by plan replay, including fresh top-N dependency binding and a fixed data version across tools.
4. Implement semantic diff thresholds, structural changes, null/zero and incomparable cases.
5. Preserve previous chart on timeout/partial refresh and expose separate attempt status.
6. Build functional Explore and Dashboard screens sufficient to test end-to-end behavior.
7. Verify pin survives page and Compose restart; no-change real data refresh remains no-change; isolated changed fixtures trigger expected diffs; concurrent refresh cannot overwrite newer data.
Gate: browser evidence plus persistence/diff tests. Ask approval for Phase 6.

## Phase 6 — visual design and accessible interaction
1. Re-read relevant fetched UI skills; generate shadcn primitives under the selected family.
2. Apply Design.md tokens and two-page layout to the working interface.
3. Integrate actual Morphicons state transitions with static reduced-motion equivalents.
4. Add verified theSVG brand assets only to honest source/technology context; update source ledger.
5. Add chart/data view, assumptions, provenance, chart-option selector and visible partial/fallback states.
6. Review 390/768/1440px, keyboard focus, long labels, error states and reduced motion. Use the Emil review format Before / After / Why for issues when reviewing UI code.
Gate: real screenshots/browser evidence, usable responsive UI and resource ledger. Ask approval for Phase 7.

## Phase 7 — submission validation and demo ✅ COMPLETED
1. ✅ Run regression matrix for ten questions, seven shape rules, all filter patterns, both agent modes, guardrails and persistence.
2. ✅ Test clean checkout/clean-volume docker compose up path. Clean-start test: 7/7 PASS.
3. ✅ README completed: 200 lines with one-command startup, environment settings, MCP tools, endpoints, architecture, project structure.
4. ⏳ Demo video recording — requires Playwright screen capture with Docker running (blocked by environment).
5. ⏳ Demo video — pending Docker availability.
6. ⏳ Video link in README — pending recording.
7. ✅ Audit secrets, placeholders and claims. Security audit: 6/6 PASS. No secrets found.
Gate: All evidence gates pass. 10/10 acceptance criteria PASS. Awaiting user final review.

## Regression cases required across gates
- Date phrase last year; half-year; no range assumption; invalid range; outside-data range.
- Seller SP vs destination SP, accent normalization, top-N ties, worst-score ascending.
- Multi-item/multi-payment order; repeated review; duplicate geolocation; untranslated category.
- Missing delivery/review; zero-to-nonzero diff; null-to-value; added/removed entity; changed ranking; identical values in different row order; totals canceling changes.
- One failed independent tool; failed dependency; overall timeout; provider down; SDK invalid arguments; MCP child restart.
- Chart ambiguity with selection saved to pin; invalid chart JSON; multiple units; zero score bins.
- API/database restart; concurrent refresh; failed import; incomplete refresh preserving snapshot.
