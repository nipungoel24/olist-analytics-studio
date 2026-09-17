# PHASE 1 RE-VERIFICATION REPORT

**Date**: 2026-09-07T18:30:00Z
**Phase**: Phase 1 — Reproducible Foundation and Data Import
**Status**: ✅ COMPLETE — Recommended: APPROVE

---

## Executive Summary

Phase 1 has been fully implemented and verified. All quality gate items pass. A subsequent audit found 6 issues, all of which have been repaired and verified. The system starts with one command (`docker compose up --build`), imports 99,224 source review rows (was 98,410 due to a lossy PK), and all 9 fan-out correctness tests pass.

---

## Audit Issues Found and Repaired

### Issue 1: Lossy Primary Key on order_reviews (CRITICAL)
**Problem**: `review_id TEXT PRIMARY KEY` silently dropped 814 rows where same `review_id` covers multiple `order_id` values (789 review_ids have 2+ different order_ids).
**Fix**: Changed to composite PK `PRIMARY KEY (review_id, order_id)`.
**Evidence**: All 99,224 source rows preserved (was 98,410).
**File**: `migrations/001-raw-tables.sql`

### Issue 2: MCP Readiness Placeholder (CRITICAL)
**Problem**: `setTimeout(1000)` was a placeholder; `/api/ready` returned true without verifying MCP server was actually connected.
**Fix**: Real `@modelcontextprotocol/client` with `versionNegotiation: { mode: { pin: '2026-07-28' } }` → `client.listTools()` → verifies `dataset_metadata` tool visible.
**Evidence**: Logs show "MCP child ready, tools: dataset_metadata".
**File**: `apps/api/src/server.ts`

### Issue 3: DB Port Binding (MEDIUM)
**Problem**: `5432:5432` conflicts with host PostgreSQL.
**Fix**: Changed to `127.0.0.1:5433:5432`.
**File**: `compose.yaml`

### Issue 4: Test Infrastructure Broken (MEDIUM)
**Problem**: `tests/` not in pnpm workspace; tests failed to run.
**Fix**: Added `tests` to `pnpm-workspace.yaml`, pinned dependencies, created `vitest.config.ts` and `tsconfig.json`, fixed test port to 5433, added `beforeAll` fixture loading, fixed SQL alias bug and string/number comparisons, updated fixtures for composite PK.
**Evidence**: `pnpm --filter @olist/tests test` → 9/9 pass.

### Issue 5: Unused papaparse Dependency (LOW)
**Problem**: papaparse was listed but unused.
**Fix**: Removed from `apps/ingest/package.json`.

### Issue 6: Fixture SQL ON CONFLICT Mismatch (LOW)
**Problem**: Fixture SQL used `ON CONFLICT (review_id)` which doesn't match the new composite PK.
**Fix**: Updated to `ON CONFLICT (review_id, order_id)`.

---

## Quality Gate Results

| Gate Item | Command | Exit | Status |
|-----------|---------|------|--------|
| Lockfile install | `pnpm install --frozen-lockfile` | 0 | ✅ |
| TypeScript compile (all) | `pnpm --filter @olist/* build` | 0 | ✅ |
| Compose config | `docker compose config --quiet` | 0 | ✅ |
| Test suite | `pnpm --filter @olist/tests test` | 0 | ✅ |
| API health | `GET /api/health` | 200 | ✅ |
| API ready | `GET /api/ready` | 200 | ✅ |
| Data import | Docker init logs | — | ✅ |
| Idempotency | Second startup skips import | — | ✅ |
| Persistence | `docker compose down` → `up` | — | ✅ |
| One-command startup | `docker compose up --build` | — | ✅ |
| Dataset size | `SELECT count(*) FROM raw.order_reviews` | 99,224 | ✅ |

---

## MCP SDK Compliance

| Item | Status | Detail |
|------|--------|--------|
| Server package | ✅ | `@modelcontextprotocol/server@2.0.0` |
| Client package | ✅ | `@modelcontextprotocol/client@2.0.0` |
| Transport | ✅ | stdio (`StdioClientTransport`) |
| Protocol version | ✅ | `2026-07-28` (modern era) |
| Legacy rejection | ✅ | `serveStdio(factory, { legacy: 'reject' })` |
| Client negotiation | ✅ | `versionNegotiation: { mode: { pin: '2026-07-28' } }` |
| readiness probe | ✅ | Real `client.listTools()` call |

---

## Data Verification

| Table | Row Count | Source |
|-------|-----------|--------|
| raw.customers | 99,443 | verified |
| raw.geolocation | 1,000,175 | verified |
| raw.orders | 99,443 | verified |
| raw.order_items | 112,653 | verified |
| raw.order_payments | 103,890 | verified |
| raw.order_reviews | 99,224 | preserved (was 98,410) |
| raw.products | 32,951 | verified |
| raw.sellers | 3,095 | verified |
| raw.product_category_name_translation | 71 | verified |

Analytics views: 9
App tables: 6 (analyses, analysis_snapshots, pins, refresh_runs + indexes)

---

## Fan-Out Correctness Tests

| Test | Status |
|------|--------|
| items_by_order returns one row per order with correct totals | ✅ |
| canonical_reviews returns one row per order (deduplicated) | ✅ |
| order_categories has distinct pairs | ✅ |
| order_sellers has distinct pairs | ✅ |
| geolocation_by_prefix reduces duplicates | ✅ |
| leading-zero ZIP prefix is preserved as text | ✅ |
| untranslated category shows "Untranslated category" | ✅ |
| payment summary does not inflate with items | ✅ |
| no fan-out when joining items_by_order with canonical_reviews | ✅ |

**Result**: 9/9 passed

---

## Git State

- Branch: `main`
- HEAD: No commits (all files untracked)
- All 23+ files present and verified
- Ready for initial commit

---

## Recommendation

**APPROVE Phase 1.** All issues identified in the initial audit have been repaired and verified. The system meets all Phase 1 gate criteria:

1. Fresh-volume startup reaches data-ready state with no manual migrations ✅
2. Repeated import is safe (idempotent) ✅
3. Fixture sums and join-grain checks pass ✅
4. All 9 fan-out correctness tests pass ✅
5. MCP child has real readiness semantics ✅
6. Database persistence survives restart ✅
7. One-command startup works ✅
8. Test infrastructure is functional ✅

**Ready for Phase 2**: Real MCP analytics tools.
