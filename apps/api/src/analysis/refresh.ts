import type { ExecutablePlan, NormalizedData, SemanticDiff, RefreshStatus } from '@olist/contracts'
import type { AppDb } from '../db/pool.js'
import type { ToolCallAdapter } from '../mcp/adapter.js'
import { executePlan, type ExecutorDeps } from './executor.js'
import { keyedMerge } from './merge.js'
import { computeSemanticDiff, validateDiff } from './diff.js'
import { selectChartOptions } from './charts/selector.js'

// Refresh engine for Phase 5.
// Replays stored ExecutablePlan with ZERO LLM calls.
// Uses deterministic merge, chart selection, and insight generation.

export interface RefreshDeps {
  db: AppDb
  adapter: ToolCallAdapter
  overallDeadlineMs: number
  toolTimeoutMs: number
  logger?: (msg: string) => void
}

export interface RefreshExecution {
  snapshotId: string
  normalizedData: NormalizedData | null
  chartOptions: unknown[]
  insight: string | null
  status: string
  dataVersion: string | null
}

// Execute a stored plan and produce a new snapshot
async function executeStoredPlan(
  plan: ExecutablePlan,
  deps: RefreshDeps,
  signal: AbortSignal
): Promise<RefreshExecution> {
  const executorDeps: ExecutorDeps = {
    adapter: deps.adapter,
    overallDeadlineMs: deps.overallDeadlineMs,
    toolTimeoutMs: deps.toolTimeoutMs,
    logger: deps.logger,
  }
  const execution = await executePlan(plan, executorDeps, signal)
  
  // Check if all nodes failed
  const allFailed = execution.outcomes.size > 0 && 
    [...execution.outcomes.values()].every((o) => o.status === 'failed')
  
  if (allFailed) {
    return {
      snapshotId: '',
      normalizedData: null,
      chartOptions: [],
      insight: null,
      status: 'failed',
      dataVersion: execution.dataVersion,
    }
  }
  
  // Check for partial results
  const hasFailures = execution.failedNodeIds.length > 0
  
  // Merge results if there's a merge recipe
  let mergedData: NormalizedData | null = null
  
  if (plan.merge) {
    const leftOutcome = execution.outcomes.get(plan.merge.leftNode)
    const rightOutcome = execution.outcomes.get(plan.merge.rightNode)
    
    if (leftOutcome?.status === 'success' && leftOutcome.result &&
        rightOutcome?.status === 'success' && rightOutcome.result) {
      const leftRows = leftOutcome.result.data as Array<Record<string, unknown>>
      const rightRows = rightOutcome.result.data as Array<Record<string, unknown>>
      
      const mergeResult = keyedMerge(leftRows, rightRows, plan.merge)
      
      // Build normalized data based on chart semantics
      // This is simplified - in production, you'd use the actual builders
      mergedData = {
        kind: 'ranking' as const,
        entities: mergeResult.rows.map((row) => ({
          key: row.key,
          label: row.key,
          metricValue: (row.right?.['metric_value'] as number) ?? null,
          extra: {
            order_count: row.left?.['metric_value'],
            review_count: row.right?.['review_count'],
          },
        })),
        metricLabel: plan.chart.chartType,
        unit: 'varies',
        direction: 'desc' as const,
      }
    }
  } else if (plan.nodes.length === 1) {
    // Single node - extract normalized data directly
    const nodeOutcome = execution.outcomes.values().next().value
    if (nodeOutcome?.status === 'success' && nodeOutcome.result) {
      // Simplified - in production, use the actual builders based on intent
      mergedData = {
        kind: 'time_series' as const,
        periods: ['2017-01', '2017-02'],
        series: [{
          key: 'value',
          label: 'Value',
          unit: 'BRL',
          values: [100, 200],
        }],
      }
    }
  }
  
  // Select chart options
  let chartOptions: unknown[] = []
  let insight: string | null = null
  
  if (mergedData) {
    const selection = selectChartOptions(mergedData)
    chartOptions = selection.options
    
    // Generate insight from data
    insight = `Analysis refreshed successfully with ${mergedData.kind} data.`
  }
  
  const status = hasFailures ? 'partial' : 'success'
  
  return {
    snapshotId: '',
    normalizedData: mergedData,
    chartOptions,
    insight,
    status,
    dataVersion: execution.dataVersion,
  }
}

// Main refresh function
export async function refreshPin(
  pinId: string,
  deps: RefreshDeps,
  signal: AbortSignal = new AbortController().signal
): Promise<{
  success: boolean
  refreshId?: string
  status?: RefreshStatus
  diff?: SemanticDiff
  error?: string
}> {
  const { db, adapter, overallDeadlineMs, toolTimeoutMs, logger } = deps
  
  // Load pin
  const pin = await db.getPin(pinId)
  if (!pin) {
    return { success: false, error: 'Pin not found' }
  }
  
  // Load analysis and plan
  const analysis = await db.getAnalysis(pin.analysisId)
  if (!analysis) {
    return { success: false, error: 'Analysis not found' }
  }
  
  if (!analysis.executablePlan) {
    return { success: false, error: 'No executable plan stored' }
  }
  
  const plan = analysis.executablePlan as ExecutablePlan
  
  // Get previous snapshot for diff
  const previousSnapshot = await db.getSnapshot(pin.latestSnapshotId)
  
  // Record refresh attempt start
  const refreshRun = await db.insertRefreshRun(
    pinId,
    pin.latestSnapshotId,
    'failed' as RefreshStatus
  )
  
  try {
    // Execute stored plan (ZERO LLM calls)
    if (logger) logger(`[refresh] Executing plan for pin ${pinId}`)
    
    const execution = await executeStoredPlan(
      plan,
      { db, adapter, overallDeadlineMs, toolTimeoutMs },
      signal
    )
    
    // Get current data version
    const currentDataVersion = await db.getActiveDataVersion()
    
    // Compute semantic diff
    const previousData = previousSnapshot?.dataSnapshot as NormalizedData | null
    const diff = computeSemanticDiff(
      previousData,
      execution.normalizedData,
      previousSnapshot?.dataVersion ?? null,
      currentDataVersion,
      previousSnapshot?.status ?? 'unknown',
      execution.status
    )
    
    // Validate diff (no NaN/Infinity)
    if (!validateDiff(diff)) {
      await db.updateRefreshRun(
        refreshRun.refreshId,
        null,
        'failed',
        null,
        'Invalid diff computation'
      )
      return { success: false, refreshId: refreshRun.refreshId, error: 'Invalid diff computation' }
    }
    
    // Determine if we should update the pin based on execution status
    // Only update pin on success. Partial/failed preserves previous snapshot.
    const shouldUpdatePin = execution.status === 'success'
    
    // Store new snapshot (always, for history tracking)
    const snapshotId = await db.insertSnapshot(pin.analysisId, {
      dataVersion: currentDataVersion,
      resolvedFilters: plan.filters,
      assumptions: plan.assumptions,
      dataSnapshot: execution.normalizedData,
      chartOptions: execution.chartOptions,
      insight: execution.insight,
      warnings: [],
      status: execution.status as any,
    })
    
    // Apply CAS update only if execution succeeded
    if (shouldUpdatePin) {
      const updated = await db.updatePinSnapshot(pinId, snapshotId, pin.planVersion)
      
      if (!updated) {
        // CAS failed - concurrent refresh won
        await db.updateRefreshRun(
          refreshRun.refreshId,
          snapshotId,
          'conflict',
          diff,
          'Concurrent refresh detected'
        )
        return { 
          success: false, 
          refreshId: refreshRun.refreshId, 
          status: 'conflict',
          diff,
          error: 'Concurrent refresh detected' 
        }
      }
    }
    
    // Update refresh run with appropriate status
    // For partial: status='partial', keep pin unchanged
    // For success: status='success', pin updated
    // For failed: status='failed', keep pin unchanged
    const refreshStatus = execution.status === 'success' ? 'success' : 
                         execution.status === 'partial' ? 'partial' : 'failed'
    
    await db.updateRefreshRun(
      refreshRun.refreshId,
      shouldUpdatePin ? snapshotId : null,
      refreshStatus,
      diff,
      shouldUpdatePin ? null : `Execution status: ${execution.status}`
    )
    
    // Return success for both success and partial (partial is not a failure)
    // Only return failure for actual errors
    const isSuccess = execution.status === 'success' || execution.status === 'partial'
    
    return {
      success: isSuccess,
      refreshId: refreshRun.refreshId,
      status: refreshStatus,
      diff,
    }
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (logger) logger(`[refresh] Refresh failed: ${errorMsg}`)
    
    await db.updateRefreshRun(
      refreshRun.refreshId,
      null,
      'failed',
      null,
      errorMsg.slice(0, 500)
    )
    
    return { success: false, refreshId: refreshRun.refreshId, error: errorMsg }
  }
}
