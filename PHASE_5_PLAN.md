# PHASE 5 IMPLEMENTATION PLAN
## Persistent Pins, Reproducible Refresh, Semantic Diff, Functional UI

**Date**: 2026-09-09
**Baseline**: 275/275 tests passing
**Target**: Phase 5 complete with persistent pins, refresh, semantic diff, and functional UI

---

## EXECUTIVE SUMMARY

Phase 5 builds on the completed Phases 1-4 foundation. The database schema already exists (`003-app-schema.sql` with `analyses`, `analysis_snapshots`, `pins`, `refresh_runs` tables). The implementation adds:

1. **Persistence layer**: Pin CRUD operations in `AppDb`
2. **Pin API routes**: POST/GET/DELETE pins
3. **Refresh engine**: Replay stored ExecutablePlans without LLM
4. **Semantic diff**: Compare analytical values with threshold detection
5. **Concurrency**: Optimistic locking via `plan_version`
6. **Functional UI**: Minimal Explore + Dashboard pages

---

## CURRENT STATE ANALYSIS

### Database Schema (Already Exists)
```sql
-- migrations/003-app-schema.sql
app.analyses (analysis_id, original_question, executable_plan, agent_mode, created_at)
app.analysis_snapshots (snapshot_id, analysis_id, data_version, resolved_filters, assumptions, 
                        data_snapshot, chart_options, insight, warnings, status, created_at)
app.pins (pin_id, analysis_id, latest_snapshot_id, chosen_chart_option, plan_version, 
          title, created_at, updated_at)
app.refresh_runs (refresh_id, pin_id, previous_snapshot_id, new_snapshot_id, status, 
                  semantic_diff, failure_reason, started_at, completed_at)
```

### Current Persistence (pool.ts)
- `insertAnalysis()` ✅
- `insertSnapshot()` ✅
- `getActiveDataVersion()` ✅
- **Missing**: `insertPin()`, `getPins()`, `getPin()`, `deletePin()`, `insertRefreshRun()`, `updatePinSnapshot()`

### Current API Routes (analyses.ts)
- `POST /api/analyses` ✅
- **Missing**: `POST /api/pins`, `GET /api/pins`, `DELETE /api/pins/:id`, `POST /api/pins/:id/refresh`

### Current Frontend (App.tsx)
- Minimal skeleton: `<div>Olist Analytics Studio</div>`
- **Missing**: All UI components

### Current Executor (executor.ts)
- `executePlan()` ✅ with fan_out support
- **Ready for refresh replay**

---

## IMPLEMENTATION PLAN

### Step 1: Extend AppDb with Pin/Refresh Methods
**File**: `apps/api/src/db/pool.ts`

Add methods:
- `insertPin(analysisId, snapshotId, chartOption, title): Promise<Pin>`
- `getPins(): Promise<PinWithSnapshot[]>`
- `getPin(pinId): Promise<PinWithSnapshot | null>`
- `getPinByAnalysisAndChart(analysisId, chartOption): Promise<Pin | null>`
- `deletePin(pinId): Promise<boolean>`
- `updatePinSnapshot(pinId, newSnapshotId, currentRevision): Promise<boolean>`
- `insertRefreshRun(pinId, previousSnapshotId, status, diff?, failureReason?): Promise<RefreshRun>`
- `updateRefreshRun(refreshId, newSnapshotId, status, diff?, failureReason?): Promise<void>`
- `getAnalysis(analysisId): Promise<Analysis | null>`
- `getSnapshot(snapshotId): Promise<Snapshot | null>`

### Step 2: Create Pin Contracts
**File**: `packages/contracts/src/pin.ts`

Define Zod schemas:
- `PinSchema` (pin_id, analysis_id, latest_snapshot_id, chosen_chart_option, plan_version, title, timestamps)
- `PinWithSnapshotSchema` (pin + snapshot data)
- `CreatePinRequestSchema` (analysisId, chartOptionId?, title?)
- `RefreshResultSchema` (status, diff, previousDataVersion, newDataVersion)

### Step 3: Implement Pin API Routes
**File**: `apps/api/src/routes/pins.ts`

#### POST /api/pins
- Validate request body
- Verify analysis exists and is pinnable (success/partial status)
- Check for duplicate pin (same analysis + chart option)
- Insert pin with CAS (plan_version starts at 1)
- Return pin

#### GET /api/pins
- Query all pins with latest snapshot data
- Return bounded response (max 100 pins)

#### DELETE /api/pins/:id
- Verify pin exists
- Delete pin (cascades to refresh_runs)
- Return success/404

#### POST /api/pins/:id/refresh
- Load pin and verify it exists
- Load analysis and ExecutablePlan
- Validate planVersion compatibility
- Execute plan replay (ZERO LLM calls)
- Compute semantic diff
- Apply CAS update
- Store refresh run history
- Return refresh result

### Step 4: Implement Semantic Diff Engine
**File**: `apps/api/src/analysis/diff.ts`

#### Functions:
- `computeSemanticDiff(oldData, newData): SemanticDiff`
- `isSignificantChange(diff, thresholds): boolean`
- `detectStructuralChanges(oldData, newData): StructuralChange[]`

#### Thresholds (Architecture.md §9):
- Revenue: ≥10% relative AND ≥BRL 100 absolute
- Counts: ≥10% relative AND ≥5 absolute
- Review score: ≥0.2 stars
- Duration/delay: ≥1 day
- Rates/shares: ≥5 percentage points
- Average freight: ≥BRL 5

#### Zero/Null Semantics:
- `0 → positive`: relativeChange = null, use absolute threshold
- `null → value`: coverage change, not percentage change
- `value → null`: coverage change, not percentage change

### Step 5: Implement Refresh Engine
**File**: `apps/api/src/analysis/refresh.ts`

#### Functions:
- `refreshPin(pinId, db, adapter, deadlines): Promise<RefreshResult>`

#### Flow:
1. Load pin and analysis from DB
2. Load ExecutablePlan from analysis
3. Validate plan version compatibility
4. Get current active data version
5. Execute plan replay via `executePlan()`
6. Normalize results (charts, insights)
7. Compute semantic diff against previous snapshot
8. Apply CAS update (pin.latest_snapshot_id, pin.plan_version++)
9. Store refresh run history
10. Return result with diff

### Step 6: Build Functional UI
**File**: `apps/web/src/`

#### Components:
- `pages/ExplorePage.tsx`: Query input, submit, result display, pin action
- `pages/DashboardPage.tsx`: Pin list, refresh, delete, status display
- `features/analysis/ResultCard.tsx`: Chart, insight, assumptions, pin button
- `features/dashboard/PinCard.tsx`: Saved chart, refresh, status, diff
- `components/ui/`: shadcn primitives (Button, Card, Input, Badge, etc.)

#### API Client:
- `lib/api.ts`: fetch wrapper for POST/GET/DELETE pins

### Step 7: Implement Tests
**File**: `tests/integration/phase5-*.test.ts`

#### Pin Tests:
- `phase5-pins.test.ts`: CRUD operations, duplicate protection, eligibility
- `phase5-refresh.test.ts`: Refresh engine, semantic diff, concurrency
- `phase5-persistence.test.ts`: Restart persistence, delete persistence
- `phase5-diff.test.ts`: Threshold boundaries, zero/null handling

### Step 8: Docker Verification
- Verify restart persistence with named volume
- Verify pin survives `docker compose restart`

---

## DETAILED IMPLEMENTATION SEQUENCE

### Phase 5.1: Persistence Layer (Day 1)
1. Create `packages/contracts/src/pin.ts` with Zod schemas
2. Extend `apps/api/src/db/pool.ts` with pin/refresh methods
3. Write unit tests for new DB methods

### Phase 5.2: Pin API Routes (Day 2)
1. Create `apps/api/src/routes/pins.ts`
2. Implement POST/GET/DELETE pins
3. Write integration tests for pin routes

### Phase 5.3: Semantic Diff Engine (Day 2)
1. Create `apps/api/src/analysis/diff.ts`
2. Implement threshold logic
3. Write threshold boundary tests

### Phase 5.4: Refresh Engine (Day 3)
1. Create `apps/api/src/analysis/refresh.ts`
2. Implement plan replay refresh
3. Implement CAS concurrency
4. Write refresh tests (unchanged, changed, Q7 rerank, etc.)

### Phase 5.5: Functional UI (Day 4)
1. Set up shadcn components
2. Build ExplorePage with query/pin flow
3. Build DashboardPage with refresh/delete flow
4. Test end-to-end in browser

### Phase 5.6: Quality Gate (Day 5)
1. Run full test suite (target: 275+ baseline)
2. Verify Docker restart persistence
3. Document known limitations
4. Update Memory.md

---

## CRITICAL CONSTRAINTS

### Refresh MUST NOT Use LLM
```
POST /api/pins/:id/refresh must NOT call:
- NativeLLMAgent
- RuleBasedAgent
- Intent matching
- Natural-language normalization
- Provider adapter
- Anthropic API
```

### Q7 Dynamic Refresh
- Stored plan retains `fan_out(category_english)` binding
- Refresh re-runs category ranking → derives CURRENT top-N → binds fresh review calls
- Never reuse old category names

### Optimistic Concurrency
```sql
UPDATE pins 
SET latest_snapshot_id = $1, plan_version = plan_version + 1, updated_at = NOW()
WHERE pin_id = $2 AND plan_version = $3
```
If affected rows = 0 → concurrent refresh lost race

### Server Trust Boundary
Browser must NOT submit:
- executablePlan
- normalizedData
- Chart.js config
- dataVersion
- arbitrary insight

---

## TEST MATRIX

### Pin Tests
| Test Case | Expected |
|-----------|----------|
| Create valid pin | 201 + pin object |
| Duplicate pin (same analysis + chart) | 409 or idempotent |
| Pin missing analysis | 404 |
| Pin unsupported result | 400 |
| List pins | 200 + array |
| Delete pin | 200 |
| Delete missing pin | 404 |
| Delete survives restart | Pin removed after restart |

### Refresh Tests
| Test Case | Expected |
|-----------|----------|
| Refresh unchanged data | No significant change |
| Refresh with significant change | Diff detected |
| Q7 rerank refresh | New top-N membership |
| Partial refresh | Previous good snapshot preserved |
| Failed refresh | Previous good snapshot preserved |
| Concurrent refresh race | CAS rejection |
| LLM pin refresh without API key | Succeeds (zero LLM calls) |
| Zero provider calls on refresh | Regression proof |

### Diff Threshold Tests
| Metric | Below | At | Above |
|--------|-------|----|-------|
| Revenue | 9.9% + large abs | 10% + BRL 99 | 10% + BRL 100 |
| Review score | 0.19 stars | 0.20 stars | 0.21 stars |
| Duration | 0.99 days | 1.00 days | 1.01 days |
| Rate/share | 4.99 pp | 5.00 pp | 5.01 pp |

### Persistence Tests
| Test Case | Expected |
|-----------|----------|
| Pin survives API restart | Same pinId present |
| Pin survives DB restart | Same pinId present |
| Pin survives `docker compose restart` | Same pinId present |
| Delete survives restart | Pin remains deleted |

---

## FILES TO CREATE/MODIFY

### New Files
- `packages/contracts/src/pin.ts`
- `apps/api/src/routes/pins.ts`
- `apps/api/src/analysis/diff.ts`
- `apps/api/src/analysis/refresh.ts`
- `apps/web/src/pages/ExplorePage.tsx`
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/features/analysis/ResultCard.tsx`
- `apps/web/src/features/dashboard/PinCard.tsx`
- `apps/web/src/lib/api.ts`
- `tests/integration/phase5-pins.test.ts`
- `tests/integration/phase5-refresh.test.ts`
- `tests/integration/phase5-diff.test.ts`
- `tests/integration/phase5-persistence.test.ts`

### Modified Files
- `apps/api/src/db/pool.ts` (extend AppDb interface)
- `apps/api/src/server.ts` (register pin routes)
- `apps/web/src/App.tsx` (routing)
- `packages/contracts/src/index.ts` (export pin schemas)

---

## RISK MITIGATION

| Risk | Mitigation |
|------|------------|
| CAS race condition | Test concurrent refresh explicitly |
| Q7 refresh uses old categories | Test rerank with fixture mutation |
| Diff threshold floating-point | Use exact decimal comparisons |
| Partial refresh loses data | Preserve previous snapshot explicitly |
| Restart loses pins | Test with named Docker volume |

---

## ACCEPTANCE CRITERIA

### Must Have
- [ ] POST/GET/DELETE pins working
- [ ] Refresh replays stored plan (zero LLM)
- [ ] Semantic diff with threshold detection
- [ ] Q7 dynamic refresh works
- [ ] CAS concurrency prevents overwrites
- [ ] Restart persistence verified
- [ ] All 275+ tests passing
- [ ] Functional Explore + Dashboard UI

### Nice to Have
- [ ] Browser E2E evidence
- [ ] Diff boundary tests at exact thresholds
- [ ] Partial/failed refresh preservation tests

---

**Status**: READY FOR IMPLEMENTATION
**Estimated Effort**: 5 days
**Baseline Protection**: 275/275 tests must remain green
