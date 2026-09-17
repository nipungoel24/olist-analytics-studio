import type { ExecutablePlan, PlanNode, ToolResponse, ToolResult, ToolErrorResponse } from '@olist/contracts'
import type { ToolCallAdapter } from '../mcp/adapter.js'

// Deterministic plan executor (Architecture.md §6, Phases.md Phase 3.4).
// - Independent nodes run concurrently (allSettled-style collection)
// - Dependent nodes wait for prerequisites and bind parameter values
// - Data version is captured from the first successful node; mismatches are
//   retried once and then failed (never mix dataset versions)
// - Deadlines clamp to remaining budget; a timed-out node fails without
//   killing sibling successes

export interface NodeOutcome {
  nodeId: string
  tool: string
  params: Record<string, unknown>
  status: 'success' | 'failed' | 'empty'
  result?: ToolResult
  boundResults?: Array<{ key: string; result: ToolResult }>
  errorCode?: string
  errorMessage?: string
  rowCount?: number
  dataVersion?: string
}

export interface PlanExecution {
  outcomes: Map<string, NodeOutcome>
  failedNodeIds: string[]
  emptyNodeIds: string[]
  dataVersion: string | null
}

export interface ExecutorDeps {
  adapter: ToolCallAdapter
  overallDeadlineMs: number
  toolTimeoutMs: number
  logger?: (msg: string) => void
}

interface ExecContext {
  adapter: ToolCallAdapter
  outcomes: Map<string, NodeOutcome>
  deadlineAt: number
  toolTimeoutMs: number
  signal: AbortSignal
  boundVersion: string | null
  retriedNodes: Set<string>
  logger?: (msg: string) => void
}

function remainingMs(ctx: ExecContext): number {
  return Math.max(0, ctx.deadlineAt - Date.now())
}

async function callWithDeadline(
  ctx: ExecContext,
  tool: string,
  params: Record<string, unknown>
): Promise<ToolResponse> {
  const timeoutMs = Math.min(ctx.toolTimeoutMs, remainingMs(ctx))
  if (timeoutMs <= 0 || ctx.signal.aborted) {
    return {
      ok: false,
      tool,
      error: { code: 'QUERY_TIMEOUT', message: 'Tool call exceeded the analysis deadline' },
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('tool timeout')), timeoutMs)
  })
  const abortPromise = new Promise<never>((_resolve, reject) => {
    ctx.signal.addEventListener(
      'abort',
      () => reject(new Error('analysis aborted')),
      { once: true }
    )
  })

  try {
    return await Promise.race([ctx.adapter.callTool(tool, params), timeoutPromise, abortPromise])
  } catch (err) {
    const msg = err instanceof Error && err.message ? err.message : String(err)
    if (msg === 'tool timeout') {
      return {
        ok: false,
        tool,
        error: { code: 'QUERY_TIMEOUT', message: `Tool call exceeded its ${timeoutMs}ms deadline` },
      }
    }
    if (msg === 'analysis aborted') {
      return {
        ok: false,
        tool,
        error: { code: 'QUERY_TIMEOUT', message: 'Analysis was cancelled before the tool call completed' },
      }
    }
    return {
      ok: false,
      tool,
      error: { code: 'INTERNAL_ERROR', message: msg.slice(0, 400) },
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

interface ResolvedParams {
  params: Record<string, unknown>
  fanOutParam: string | null
  fanOutValues: string[]
}

function resolveParams(ctx: ExecContext, nodePlan: PlanNode): ResolvedParams {
  const params: Record<string, unknown> = { ...nodePlan.params }
  let fanOutParam: string | null = null
  let fanOutValues: string[] = []

  for (const binding of nodePlan.bindings) {
    const dep = ctx.outcomes.get(binding.fromNode)
    if (!dep || dep.status !== 'success' || !dep.result) {
      throw new Error(`binding source node ${binding.fromNode} did not succeed`)
    }
    const rows = dep.result.data as Array<Record<string, unknown>>
    if (binding.mode === 'fan_out') {
      const values: string[] = []
      for (const row of rows) {
        const v = row[binding.field]
        if (typeof v === 'string' && !values.includes(v)) values.push(v)
      }
      if (values.length === 0) {
        throw new Error(`binding source node ${binding.fromNode} produced no values for field ${binding.field}`)
      }
      fanOutParam = binding.param
      fanOutValues = values
    } else {
      const value = rows[0]?.[binding.field]
      if (value === undefined || value === null) {
        throw new Error(`binding source node ${binding.fromNode} produced no value for field ${binding.field}`)
      }
      params[binding.param] = value
    }
  }

  return { params, fanOutParam, fanOutValues }
}

function failNode(
  ctx: ExecContext,
  nodePlan: PlanNode,
  status: 'failed' | 'empty',
  errorCode: string,
  errorMessage: string
): void {
  ctx.outcomes.set(nodePlan.nodeId, {
    nodeId: nodePlan.nodeId,
    tool: nodePlan.tool,
    params: nodePlan.params,
    status,
    errorCode,
    errorMessage,
  })
}

function checkVersion(ctx: ExecContext, nodePlan: PlanNode, dataVersion: string | undefined): boolean {
  if (!dataVersion) return true
  if (ctx.boundVersion === null) {
    ctx.boundVersion = dataVersion
    return true
  }
  if (ctx.boundVersion === dataVersion) return true
  if (ctx.retriedNodes.has(nodePlan.nodeId)) {
    failNode(
      ctx,
      nodePlan,
      'failed',
      'DATA_VERSION_CONFLICT',
      `Dataset version changed mid-analysis (${ctx.boundVersion} vs ${dataVersion})`
    )
    return false
  }
  ctx.retriedNodes.add(nodePlan.nodeId)
  return false
}

async function executeNode(ctx: ExecContext, nodePlan: PlanNode): Promise<void> {
  let resolved: ResolvedParams
  try {
    resolved = resolveParams(ctx, nodePlan)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failNode(ctx, nodePlan, 'failed', 'INVALID_INPUT', msg)
    return
  }

  const { params, fanOutParam, fanOutValues } = resolved

  const runSingle = async (overrides: Record<string, unknown>): Promise<{ ok: boolean; response: ToolResponse; dataVersion: string | undefined }> => {
    const response = await callWithDeadline(ctx, nodePlan.tool, { ...params, ...overrides })
    if (!response.ok) {
      return { ok: false, response, dataVersion: undefined }
    }
    return { ok: true, response, dataVersion: response.meta?.dataVersion }
  }

  if (fanOutParam) {
    const boundResults: Array<{ key: string; result: ToolResult }> = []
    for (const value of fanOutValues) {
      const attempt = await runSingle({ [fanOutParam]: value })
      if (!attempt.ok) {
        const err = attempt.response as ToolErrorResponse
        failNode(ctx, nodePlan, err.error.code === 'EMPTY_RESULT' ? 'empty' : 'failed', err.error.code, err.error.message)
        return
      }
      if (!checkVersion(ctx, nodePlan, attempt.dataVersion)) {
        // retry once with the same value against the new bound version
        const retry = await runSingle({ [fanOutParam]: value })
        if (!retry.ok) {
          const err = retry.response as ToolErrorResponse
          failNode(ctx, nodePlan, err.error.code === 'EMPTY_RESULT' ? 'empty' : 'failed', err.error.code, err.error.message)
          return
        }
        if (retry.dataVersion !== ctx.boundVersion) {
          failNode(ctx, nodePlan, 'failed', 'DATA_VERSION_CONFLICT', 'Dataset version changed mid-analysis and did not stabilize')
          return
        }
        boundResults.push({ key: value, result: retry.response as ToolResult })
        continue
      }
      boundResults.push({ key: value, result: attempt.response as ToolResult })
    }
    if (boundResults.length === 0) {
      failNode(ctx, nodePlan, 'empty', 'EMPTY_RESULT', 'No bound categories produced results')
      return
    }
    const totalRows = boundResults.reduce((s, b) => s + (b.result.meta?.rowCount ?? 0), 0)
    ctx.outcomes.set(nodePlan.nodeId, {
      nodeId: nodePlan.nodeId,
      tool: nodePlan.tool,
      params: nodePlan.params,
      status: 'success',
      boundResults,
      rowCount: totalRows,
      dataVersion: ctx.boundVersion ?? boundResults[0]?.result.meta?.dataVersion,
    })
    return
  }

  const attempt = await runSingle({})
  if (!attempt.ok) {
    const err = attempt.response as ToolErrorResponse
    failNode(ctx, nodePlan, err.error.code === 'EMPTY_RESULT' ? 'empty' : 'failed', err.error.code, err.error.message)
    return
  }
  if (!checkVersion(ctx, nodePlan, attempt.dataVersion)) {
    const retry = await runSingle({})
    if (!retry.ok) {
      const err = retry.response as ToolErrorResponse
      failNode(ctx, nodePlan, err.error.code === 'EMPTY_RESULT' ? 'empty' : 'failed', err.error.code, err.error.message)
      return
    }
    if (retry.dataVersion !== ctx.boundVersion) {
      failNode(ctx, nodePlan, 'failed', 'DATA_VERSION_CONFLICT', 'Dataset version changed mid-analysis and did not stabilize')
      return
    }
    const retried = retry.response as ToolResult
    ctx.outcomes.set(nodePlan.nodeId, {
      nodeId: nodePlan.nodeId,
      tool: nodePlan.tool,
      params: nodePlan.params,
      status: 'success',
      result: retried,
      rowCount: retried.meta?.rowCount ?? retried.data.length,
      dataVersion: retried.meta?.dataVersion,
    })
    return
  }
  const toolResult = attempt.response as ToolResult
  ctx.outcomes.set(nodePlan.nodeId, {
    nodeId: nodePlan.nodeId,
    tool: nodePlan.tool,
    params: nodePlan.params,
    status: 'success',
    result: toolResult,
    rowCount: toolResult.meta?.rowCount ?? toolResult.data.length,
    dataVersion: toolResult.meta?.dataVersion,
  })
}

export async function executePlan(
  plan: ExecutablePlan,
  deps: ExecutorDeps,
  signal: AbortSignal = new AbortController().signal
): Promise<PlanExecution> {
  const ctx: ExecContext = {
    adapter: deps.adapter,
    outcomes: new Map(),
    deadlineAt: Date.now() + deps.overallDeadlineMs,
    toolTimeoutMs: deps.toolTimeoutMs,
    signal,
    boundVersion: null,
    retriedNodes: new Set(),
    logger: deps.logger,
  }

  const pending = [...plan.nodes]
  let guard = 0
  while (pending.length > 0 && guard < 100) {
    guard++
    const ready: PlanNode[] = []
    const rest: PlanNode[] = []
    for (const nodePlan of pending) {
      const depsDone = nodePlan.dependsOn.every((dep) => {
        const outcome = ctx.outcomes.get(dep)
        return outcome !== undefined && outcome.status === 'success'
      })
      if (depsDone) {
        ready.push(nodePlan)
      } else {
        rest.push(nodePlan)
      }
    }
    if (ready.length === 0) {
      for (const nodePlan of rest) {
        failNode(
          ctx,
          nodePlan,
          'failed',
          'INTERNAL_ERROR',
          `dependency ${nodePlan.dependsOn.join(', ')} did not succeed`
        )
      }
      break
    }
    pending.splice(0, pending.length, ...rest)
    await Promise.all(ready.map((nodePlan) => executeNode(ctx, nodePlan)))
  }

  const failedNodeIds: string[] = []
  const emptyNodeIds: string[] = []
  let dataVersion: string | null = null
  for (const outcome of ctx.outcomes.values()) {
    if (outcome.status === 'failed') failedNodeIds.push(outcome.nodeId)
    if (outcome.status === 'empty') emptyNodeIds.push(outcome.nodeId)
    if (!dataVersion && outcome.dataVersion) dataVersion = outcome.dataVersion
  }

  return { outcomes: ctx.outcomes, failedNodeIds, emptyNodeIds, dataVersion }
}
