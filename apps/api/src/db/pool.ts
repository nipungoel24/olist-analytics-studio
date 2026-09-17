import { Pool } from 'pg'
import type { ExecutablePlan } from '@olist/contracts'
import { validateExecutablePlan } from '@olist/contracts'
import type { AnalysisStatus } from '@olist/contracts'
import type { Pin, PinWithSnapshot, RefreshRun, RefreshStatus, SemanticDiff } from '@olist/contracts'

// Application-schema persistence. Writes are restricted to the app schema.
// No analytics credentials or raw data ever enter these tables beyond the
// bounded snapshot required by Architecture.md §8.

const PERSISTABLE_STATUSES: ReadonlySet<string> = new Set([
  'success',
  'partial',
  'empty',
  'unsupported',
  'error',
])

export interface SnapshotInput {
  dataVersion: string | null
  resolvedFilters: Record<string, unknown>
  assumptions: string[]
  dataSnapshot: unknown
  chartOptions: unknown[]
  insight: string | null
  warnings: string[]
  status: AnalysisStatus
}

export interface AppDb {
  // Analysis persistence
  insertAnalysis(question: string, plan: ExecutablePlan | null, agentMode: string): Promise<string>
  insertSnapshot(analysisId: string, input: SnapshotInput): Promise<string>
  getAnalysis(analysisId: string): Promise<{ analysisId: string; originalQuestion: string; executablePlan: ExecutablePlan | null; agentMode: string; createdAt: string } | null>
  getSnapshot(snapshotId: string): Promise<SnapshotInput & { snapshotId: string; createdAt: string } | null>
  
  // Data version
  getActiveDataVersion(): Promise<string | null>
  
  // Snapshot queries
  getSnapshotsForAnalysis(analysisId: string): Promise<Array<{ snapshotId: string; status: string; chartOptions: unknown[]; dataVersion: string; createdAt: string }>>
  
  // Pin persistence
  insertPin(analysisId: string, snapshotId: string, chartOption: number, title: string | null): Promise<Pin>
  getPins(): Promise<PinWithSnapshot[]>
  getPin(pinId: string): Promise<PinWithSnapshot | null>
  getPinByAnalysisAndChart(analysisId: string, chartOption: number): Promise<Pin | null>
  deletePin(pinId: string): Promise<boolean>
  updatePinSnapshot(pinId: string, newSnapshotId: string, currentRevision: number): Promise<boolean>
  
  // Refresh run persistence
  insertRefreshRun(pinId: string, previousSnapshotId: string | null, status: RefreshStatus, diff?: SemanticDiff | null, failureReason?: string | null): Promise<RefreshRun>
  updateRefreshRun(refreshId: string, newSnapshotId: string | null, status: RefreshStatus, diff?: SemanticDiff | null, failureReason?: string | null): Promise<void>
  
  // Cleanup
  close(): Promise<void>
}

export function createAppDb(databaseUrl: string): AppDb {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 })

  return {
    async insertAnalysis(question, plan, agentMode) {
      const result = await pool.query<{ analysis_id: string }>(
        `INSERT INTO app.analyses (original_question, executable_plan, agent_mode)
         VALUES ($1, $2, $3)
         RETURNING analysis_id`,
        [question, plan ? (validateExecutablePlan(plan) as unknown) : null, agentMode]
      )
      const analysisId = result.rows[0]?.analysis_id
      if (!analysisId) {
        throw new Error('Failed to persist analysis: no analysis_id returned')
      }
      return analysisId
    },

    async insertSnapshot(analysisId, input) {
      const result = await pool.query<{ snapshot_id: string }>(
        `INSERT INTO app.analysis_snapshots
           (analysis_id, data_version, resolved_filters, assumptions, data_snapshot, chart_options, insight, warnings, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING snapshot_id`,
        [
          analysisId,
          input.dataVersion ?? '',
          JSON.stringify(input.resolvedFilters),
          input.assumptions,
          JSON.stringify(input.dataSnapshot),
          JSON.stringify(input.chartOptions),
          input.insight,
          input.warnings,
          PERSISTABLE_STATUSES.has(input.status) ? input.status : 'error',
        ]
      )
      const snapshotId = result.rows[0]?.snapshot_id
      if (!snapshotId) {
        throw new Error('Failed to persist snapshot: no snapshot_id returned')
      }
      return snapshotId
    },

    async getAnalysis(analysisId) {
      const result = await pool.query<{
        analysis_id: string
        original_question: string
        executable_plan: ExecutablePlan | null
        agent_mode: string
        created_at: string
      }>(
        `SELECT analysis_id, original_question, executable_plan, agent_mode, created_at
         FROM app.analyses
         WHERE analysis_id = $1`,
        [analysisId]
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        analysisId: row.analysis_id,
        originalQuestion: row.original_question,
        executablePlan: row.executable_plan,
        agentMode: row.agent_mode,
        createdAt: row.created_at,
      }
    },

    async getSnapshot(snapshotId) {
      const result = await pool.query<{
        snapshot_id: string
        data_version: string
        resolved_filters: Record<string, unknown>
        assumptions: string[]
        data_snapshot: unknown
        chart_options: unknown[]
        insight: string | null
        warnings: string[]
        status: string
        created_at: string
      }>(
        `SELECT snapshot_id, data_version, resolved_filters, assumptions, data_snapshot, 
                chart_options, insight, warnings, status, created_at
         FROM app.analysis_snapshots
         WHERE snapshot_id = $1`,
        [snapshotId]
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        snapshotId: row.snapshot_id,
        dataVersion: row.data_version,
        resolvedFilters: row.resolved_filters,
        assumptions: row.assumptions,
        dataSnapshot: row.data_snapshot,
        chartOptions: row.chart_options,
        insight: row.insight,
        warnings: row.warnings,
        status: row.status as AnalysisStatus,
        createdAt: row.created_at,
      }
    },

    async getActiveDataVersion() {
      try {
        const result = await pool.query<{ source_checksum: string }>(
          `SELECT dv.source_checksum
             FROM app.active_dataset ad
             JOIN app.dataset_versions dv ON ad.dataset_version_id = dv.version_id`
        )
        return result.rows[0]?.source_checksum ?? null
      } catch {
        return null
      }
    },

    async getSnapshotsForAnalysis(analysisId) {
      const result = await pool.query<{
        snapshot_id: string
        status: string
        chart_options: unknown[]
        data_version: string
        created_at: string
      }>(
        `SELECT snapshot_id, status, chart_options, data_version, created_at
         FROM app.analysis_snapshots
         WHERE analysis_id = $1
         ORDER BY created_at DESC`,
        [analysisId]
      )
      return result.rows.map((row) => ({
        snapshotId: row.snapshot_id,
        status: row.status,
        chartOptions: row.chart_options,
        dataVersion: row.data_version,
        createdAt: row.created_at,
      }))
    },

    async insertPin(analysisId, snapshotId, chartOption, title) {
      const result = await pool.query<{
        pin_id: string
        analysis_id: string
        latest_snapshot_id: string
        chosen_chart_option: number
        plan_version: number
        title: string | null
        created_at: string
        updated_at: string
      }>(
        `INSERT INTO app.pins (analysis_id, latest_snapshot_id, chosen_chart_option, title)
         VALUES ($1, $2, $3, $4)
         RETURNING pin_id, analysis_id, latest_snapshot_id, chosen_chart_option, plan_version, title, created_at, updated_at`,
        [analysisId, snapshotId, chartOption, title]
      )
      const row = result.rows[0]
      if (!row) {
        throw new Error('Failed to persist pin: no pin_id returned')
      }
      return {
        pinId: row.pin_id,
        analysisId: row.analysis_id,
        latestSnapshotId: row.latest_snapshot_id,
        chosenChartOption: row.chosen_chart_option,
        planVersion: row.plan_version,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    },

    async getPins() {
      const result = await pool.query<{
        pin_id: string
        analysis_id: string
        latest_snapshot_id: string
        chosen_chart_option: number
        plan_version: number
        title: string | null
        created_at: string
        updated_at: string
        original_question: string
        executable_plan: ExecutablePlan | null
        agent_mode: string
        data_version: string | null
        resolved_filters: Record<string, unknown>
        assumptions: string[]
        data_snapshot: unknown
        chart_options: unknown[]
        insight: string | null
        warnings: string[]
        snapshot_status: string
        snapshot_created_at: string
        last_refresh_status: string | null
        last_refresh_at: string | null
      }>(
        `SELECT 
           p.pin_id, p.analysis_id, p.latest_snapshot_id, p.chosen_chart_option,
           p.plan_version, p.title, p.created_at, p.updated_at,
           a.original_question, a.executable_plan, a.agent_mode,
           s.data_version, s.resolved_filters, s.assumptions, s.data_snapshot,
           s.chart_options, s.insight, s.warnings, s.status as snapshot_status,
           s.created_at as snapshot_created_at,
           rr.status as last_refresh_status, rr.completed_at as last_refresh_at
         FROM app.pins p
         JOIN app.analyses a ON p.analysis_id = a.analysis_id
         JOIN app.analysis_snapshots s ON p.latest_snapshot_id = s.snapshot_id
         LEFT JOIN LATERAL (
           SELECT status, completed_at
           FROM app.refresh_runs
           WHERE pin_id = p.pin_id
           ORDER BY started_at DESC
           LIMIT 1
         ) rr ON true
         ORDER BY p.updated_at DESC
         LIMIT 100`
      )
      return result.rows.map((row) => ({
        pinId: row.pin_id,
        analysisId: row.analysis_id,
        latestSnapshotId: row.latest_snapshot_id,
        chosenChartOption: row.chosen_chart_option,
        planVersion: row.plan_version,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        originalQuestion: row.original_question,
        executablePlan: row.executable_plan,
        agentMode: row.agent_mode,
        dataVersion: row.data_version,
        resolvedFilters: row.resolved_filters,
        assumptions: row.assumptions,
        dataSnapshot: row.data_snapshot,
        chartOptions: row.chart_options,
        insight: row.insight,
        warnings: row.warnings,
        snapshotStatus: row.snapshot_status,
        snapshotCreatedAt: row.snapshot_created_at,
        lastRefreshStatus: row.last_refresh_status,
        lastRefreshAt: row.last_refresh_at,
      }))
    },

    async getPin(pinId) {
      const result = await pool.query<{
        pin_id: string
        analysis_id: string
        latest_snapshot_id: string
        chosen_chart_option: number
        plan_version: number
        title: string | null
        created_at: string
        updated_at: string
        original_question: string
        executable_plan: ExecutablePlan | null
        agent_mode: string
        data_version: string | null
        resolved_filters: Record<string, unknown>
        assumptions: string[]
        data_snapshot: unknown
        chart_options: unknown[]
        insight: string | null
        warnings: string[]
        snapshot_status: string
        snapshot_created_at: string
        last_refresh_status: string | null
        last_refresh_at: string | null
      }>(
        `SELECT 
           p.pin_id, p.analysis_id, p.latest_snapshot_id, p.chosen_chart_option,
           p.plan_version, p.title, p.created_at, p.updated_at,
           a.original_question, a.executable_plan, a.agent_mode,
           s.data_version, s.resolved_filters, s.assumptions, s.data_snapshot,
           s.chart_options, s.insight, s.warnings, s.status as snapshot_status,
           s.created_at as snapshot_created_at,
           rr.status as last_refresh_status, rr.completed_at as last_refresh_at
         FROM app.pins p
         JOIN app.analyses a ON p.analysis_id = a.analysis_id
         JOIN app.analysis_snapshots s ON p.latest_snapshot_id = s.snapshot_id
         LEFT JOIN LATERAL (
           SELECT status, completed_at
           FROM app.refresh_runs
           WHERE pin_id = p.pin_id
           ORDER BY started_at DESC
           LIMIT 1
         ) rr ON true
         WHERE p.pin_id = $1`,
        [pinId]
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        pinId: row.pin_id,
        analysisId: row.analysis_id,
        latestSnapshotId: row.latest_snapshot_id,
        chosenChartOption: row.chosen_chart_option,
        planVersion: row.plan_version,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        originalQuestion: row.original_question,
        executablePlan: row.executable_plan,
        agentMode: row.agent_mode,
        dataVersion: row.data_version,
        resolvedFilters: row.resolved_filters,
        assumptions: row.assumptions,
        dataSnapshot: row.data_snapshot,
        chartOptions: row.chart_options,
        insight: row.insight,
        warnings: row.warnings,
        snapshotStatus: row.snapshot_status,
        snapshotCreatedAt: row.snapshot_created_at,
        lastRefreshStatus: row.last_refresh_status,
        lastRefreshAt: row.last_refresh_at,
      }
    },

    async getPinByAnalysisAndChart(analysisId, chartOption) {
      const result = await pool.query<{
        pin_id: string
        analysis_id: string
        latest_snapshot_id: string
        chosen_chart_option: number
        plan_version: number
        title: string | null
        created_at: string
        updated_at: string
      }>(
        `SELECT pin_id, analysis_id, latest_snapshot_id, chosen_chart_option, plan_version, title, created_at, updated_at
         FROM app.pins
         WHERE analysis_id = $1 AND chosen_chart_option = $2
         LIMIT 1`,
        [analysisId, chartOption]
      )
      const row = result.rows[0]
      if (!row) return null
      return {
        pinId: row.pin_id,
        analysisId: row.analysis_id,
        latestSnapshotId: row.latest_snapshot_id,
        chosenChartOption: row.chosen_chart_option,
        planVersion: row.plan_version,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    },

    async deletePin(pinId) {
      const result = await pool.query(
        `DELETE FROM app.pins WHERE pin_id = $1`,
        [pinId]
      )
      return (result.rowCount ?? 0) > 0
    },

    async updatePinSnapshot(pinId, newSnapshotId, currentRevision) {
      const result = await pool.query(
        `UPDATE app.pins 
         SET latest_snapshot_id = $1, plan_version = plan_version + 1, updated_at = NOW()
         WHERE pin_id = $2 AND plan_version = $3`,
        [newSnapshotId, pinId, currentRevision]
      )
      return (result.rowCount ?? 0) > 0
    },

    async insertRefreshRun(pinId, previousSnapshotId, status, diff = null, failureReason = null) {
      const result = await pool.query<{
        refresh_id: string
        pin_id: string
        previous_snapshot_id: string | null
        new_snapshot_id: string | null
        status: string
        semantic_diff: unknown
        failure_reason: string | null
        started_at: string
        completed_at: string | null
      }>(
        `INSERT INTO app.refresh_runs (pin_id, previous_snapshot_id, status, semantic_diff, failure_reason)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING refresh_id, pin_id, previous_snapshot_id, new_snapshot_id, status, semantic_diff, failure_reason, started_at, completed_at`,
        [pinId, previousSnapshotId, status, diff ? JSON.stringify(diff) : null, failureReason]
      )
      const row = result.rows[0]
      if (!row) {
        throw new Error('Failed to persist refresh run: no refresh_id returned')
      }
      return {
        refreshId: row.refresh_id,
        pinId: row.pin_id,
        previousSnapshotId: row.previous_snapshot_id,
        newSnapshotId: row.new_snapshot_id,
        status: row.status as RefreshStatus,
        semanticDiff: row.semantic_diff,
        failureReason: row.failure_reason,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      }
    },

    async updateRefreshRun(refreshId, newSnapshotId, status, diff = null, failureReason = null) {
      await pool.query(
        `UPDATE app.refresh_runs 
         SET new_snapshot_id = $1, status = $2, semantic_diff = $3, failure_reason = $4, completed_at = NOW()
         WHERE refresh_id = $5`,
        [newSnapshotId, status, diff ? JSON.stringify(diff) : null, failureReason, refreshId]
      )
    },

    async close() {
      await pool.end().catch(() => {})
    },
  }
}
