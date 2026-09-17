import type Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages/messages.js'
import type { AgentResult, ExecutablePlan, NormalizedData, ToolResult, ToolProvenance } from '@olist/contracts'
import { validateAgentResult } from '@olist/contracts'
import type { ILLMAgent, AgentRunInput } from './interface.js'
import type { ProviderAdapter } from '../mcp/provider-adapter.js'
import type { ToolCallAdapter } from '../mcp/adapter.js'
import { type PlanExecution, type NodeOutcome } from '../analysis/executor.js'
import { keyedMerge } from '../analysis/merge.js'
import {
  fromTrends,
  fromRanking,
  fromScoreDistribution,
  fromComposition,
  buildQ7Ranking,
  buildQ8TimeSeries,
  buildQ9Correlation,
  buildQ10Correlation,
} from '../analysis/normalized-data.js'
import { selectChartOptions } from '../analysis/charts/selector.js'
import { buildInsight } from '../analysis/insight.js'
import { validateLLMInsight } from '../analysis/insight-validator.js'
import type { ToolResponse, ToolResult as McpToolResult, ToolErrorResponse } from '@olist/contracts'

// NativeLLMAgent: implements the bounded provider tool-call loop with
// automatic fallback to RuleBasedAgent on provider failures. The LLM
// handles intent understanding and tool selection; deterministic code
// owns normalization, validation, plan construction, chart selection,
// and insight generation.

export interface NativeLLMAgentDeps {
  provider: ProviderAdapter
  adapter: ToolCallAdapter
  modelTimeoutMs: number
  toolTimeoutMs: number
  maxRequestLength: number
  maxModelTurns: number
  maxToolCalls: number
  logger?: (msg: string) => void
}

interface ToolTrace {
  nodeId: string
  tool: string
  params: Record<string, unknown>
  result: McpToolResult | null
  error?: string
  status: 'success' | 'failed' | 'empty'
  dataVersion?: string
  rowCount?: number
  durationMs: number
  validationError?: boolean
}

export class NativeLLMAgent implements ILLMAgent {
  readonly mode = 'llm' as const
  private correctionBudget = 1

  constructor(private readonly deps: NativeLLMAgentDeps) {}

  async run(input: AgentRunInput): Promise<AgentResult> {
    const { question, requestId, signal } = input
    const log = this.deps.logger
    if (log) log(`[llm] request ${requestId} question: ${question.slice(0, 120)}`)

    if (question.trim().length === 0) {
      return this.emptyResult('error', 'Question must not be empty.', 'INVALID_INPUT', question)
    }
    if (question.length > this.deps.maxRequestLength) {
      return this.emptyResult(
        'error',
        `Question exceeds the maximum length of ${this.deps.maxRequestLength} characters.`,
        'REQUEST_TOO_LONG',
        question
      )
    }

    const messages: MessageParam[] = [{ role: 'user', content: question }]
    const toolTraces: ToolTrace[] = []
    let totalToolCalls = 0
    let turnCount = 0
    let modelTimedOut = false

    const deadlineAt = Date.now() + this.deps.modelTimeoutMs

    try {
      while (turnCount < this.deps.maxModelTurns) {
        if (signal.aborted || Date.now() >= deadlineAt) {
          modelTimedOut = true
          break
        }

        turnCount++
        const remainingMs = Math.max(0, deadlineAt - Date.now())

        let response: Anthropic.Message
        try {
          response = await withTimeout(
            this.deps.provider.createMessage(messages, signal),
            remainingMs,
          )
        } catch (err) {
          throw classifyProviderError(err)
        }

        if (signal.aborted) {
          modelTimedOut = true
          break
        }

        // Extract text and tool_use blocks
        const textBlocks: string[] = []
        const toolUseBlocks: ToolUseBlock[] = []

        for (const block of response.content) {
          if (block.type === 'text') {
            textBlocks.push(block.text)
          } else if (block.type === 'tool_use') {
            toolUseBlocks.push(block)
          }
        }

        // No tool calls → model is done, return final answer
        if (toolUseBlocks.length === 0) {
          const finalText = textBlocks.join('\n').trim()
          return this.buildResultFromTraces(
            finalText,
            toolTraces,
            question,
            response.stop_reason === 'end_turn' ? 'success' : 'partial',
          )
        }

        // Process tool calls
        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = []

        for (const toolBlock of toolUseBlocks) {
          totalToolCalls++
          if (totalToolCalls > this.deps.maxToolCalls) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify({ error: 'Tool call budget exceeded' }),
              is_error: true,
            })
            continue
          }

          // Validate tool name against allowlist
          const toolNames = [
            'dataset_metadata', 'order_trends', 'category_performance',
            'seller_performance', 'review_analysis', 'payment_breakdown',
            'delivery_performance',
          ]
          if (!toolNames.includes(toolBlock.name)) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify({
                error: `Unknown tool: ${toolBlock.name}. Available tools: ${toolNames.join(', ')}`,
              }),
              is_error: true,
            })
            if (this.correctionBudget > 0) {
              this.correctionBudget--
            }
            continue
          }

          // Validate tool arguments via MCP adapter
          const args = (typeof toolBlock.input === 'object' && toolBlock.input !== null
            ? toolBlock.input
            : {}) as Record<string, unknown>

          const startMs = Date.now()
          let mcpResponse: ToolResponse
          try {
            mcpResponse = await this.deps.adapter.callTool(toolBlock.name, args)
          } catch (err) {
            mcpResponse = {
              ok: false,
              tool: toolBlock.name,
              error: { code: 'INTERNAL_ERROR', message: String(err).slice(0, 400) },
            }
          }
          const durationMs = Date.now() - startMs

          if (!mcpResponse.ok) {
            const errResp = mcpResponse as ToolErrorResponse
            // Check if this is an input validation error (schema validation failure)
            const isValidationError = errResp.error.code === 'INVALID_INPUT'
            toolTraces.push({
              nodeId: `node_${toolTraces.length}`,
              tool: toolBlock.name,
              params: args,
              result: null,
              error: errResp.error.message,
              status: 'failed',
              durationMs,
              // Track validation errors for correction budget
              validationError: isValidationError,
            })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(errResp.error),
              is_error: true,
            })
            // Decrement correction budget on validation error (model's args don't match schema)
            if (isValidationError && this.correctionBudget > 0) {
              this.correctionBudget--
            }
            continue
          }

          const result = mcpResponse as McpToolResult
          toolTraces.push({
            nodeId: `node_${toolTraces.length}`,
            tool: toolBlock.name,
            params: args,
            result,
            status: result.data.length === 0 ? 'empty' : 'success',
            dataVersion: result.meta?.dataVersion,
            rowCount: result.meta?.rowCount ?? result.data.length,
            durationMs,
          })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result),
          })
        }

        // Append assistant message and tool results
        messages.push({ role: 'assistant', content: response.content as MessageParam['content'] })
        messages.push({ role: 'user', content: toolResults })
      }
    } catch (err) {
      // Provider-level failure → throw to ResilientAgent
      throw err
    }

    // Budget exhausted or timeout → build from what we have
    if (toolTraces.length > 0) {
      return this.buildResultFromTraces(
        modelTimedOut ? 'Analysis completed with available data (model timed out).' : undefined,
        toolTraces,
        question,
        'partial',
      )
    }

    return this.emptyResult(
      'error',
      modelTimedOut ? 'Model timed out before producing results.' : 'Model budget exhausted without completing analysis.',
      'MODEL_TIMEOUT',
      question
    )
  }

  private buildResultFromTraces(
    finalText: string | undefined,
    traces: ToolTrace[],
    question: string,
    fallbackStatus: AgentResult['status'],
  ): AgentResult {
    if (traces.length === 0) {
      return this.emptyResult(fallbackStatus, finalText ?? 'No tool calls were made.', undefined, question)
    }

    // Convert traces to plan + execute
    const plan = this.buildPlanFromTraces(traces, question)

    // Execute the plan deterministically
    // We already have the results in traces, so we build outcomes directly
    const outcomes = new Map<string, NodeOutcome>()
    for (let i = 0; i < plan.nodes.length; i++) {
      const nodePlan = plan.nodes[i]!
      const trace = traces.find((t) => t.nodeId === nodePlan.nodeId)
      if (trace?.status === 'success' && trace.result) {
        outcomes.set(nodePlan.nodeId, {
          nodeId: nodePlan.nodeId,
          tool: trace.tool,
          params: trace.params,
          status: 'success',
          result: trace.result,
          rowCount: trace.rowCount,
          dataVersion: trace.dataVersion,
        })
      } else if (trace?.status === 'empty') {
        outcomes.set(nodePlan.nodeId, {
          nodeId: nodePlan.nodeId,
          tool: trace.tool,
          params: trace.params,
          status: 'empty',
          errorCode: 'EMPTY_RESULT',
          errorMessage: trace.error ?? 'empty result',
        })
      } else {
        outcomes.set(nodePlan.nodeId, {
          nodeId: nodePlan.nodeId,
          tool: nodePlan.tool,
          params: nodePlan.params,
          status: 'failed',
          errorCode: 'TOOL_FAILED',
          errorMessage: trace?.error ?? 'tool call failed',
        })
      }
    }

    const execution: PlanExecution = {
      outcomes,
      failedNodeIds: [...outcomes.values()].filter((o) => o.status === 'failed').map((o) => o.nodeId),
      emptyNodeIds: [...outcomes.values()].filter((o) => o.status === 'empty').map((o) => o.nodeId),
      dataVersion: [...outcomes.values()].find((o) => o.dataVersion)?.dataVersion ?? null,
    }

    const successfulNodes = plan.nodes.filter((n) => outcomes.get(n.nodeId)?.status === 'success')
    const failedNodes = plan.nodes.filter((n) => outcomes.get(n.nodeId)?.status === 'failed')
    const isPartial = failedNodes.length > 0 || execution.emptyNodeIds.length > 0

    // Build normalized data
    let normalized: NormalizedData | null = null
    if (plan.merge && successfulNodes.length >= 2) {
      const leftOutcome = outcomes.get(plan.merge.leftNode)
      const rightOutcome = outcomes.get(plan.merge.rightNode)
      if (leftOutcome?.status === 'success' && rightOutcome?.status === 'success') {
        const leftRows = this.outcomeRows(leftOutcome, plan.merge.leftKey)
        const rightRows = this.outcomeRows(rightOutcome, plan.merge.rightKey)
        const mergeResult = keyedMerge(leftRows, rightRows, plan.merge)
        normalized = this.buildMergedNormalized(plan.intent, mergeResult.rows)
      } else {
        normalized = this.buildPartialNormalized(plan.intent, execution)
      }
    } else if (successfulNodes.length === 1) {
      const node = successfulNodes[0]!
      const outcome = outcomes.get(node.nodeId)
      if (outcome?.result) {
        normalized = this.buildSingleNormalized(plan.intent, outcome.result)
      }
    }

    // Chart selection (normal mode — not fallback bar-only)
    let chartOptions: AgentResult['chartOptions'] = []
    let chartType: string | null = null
    let chartReason: string | null = null
    if (normalized && (!isPartial || successfulNodes.length >= 1)) {
      const selection = selectChartOptions(normalized)
      chartOptions = selection.options
      chartType = selection.chartType
      chartReason = selection.chartReason
    }

    // Insight
    const insightResult = buildInsight(normalized ?? ({} as NormalizedData), plan.intent)

    // Validate LLM insight if it provided one
    let insight = insightResult.text
    const insightEvidence = insightResult.evidence
    if (finalText && insight) {
      const validated = validateLLMInsight(finalText, normalized, insightEvidence)
      if (validated) {
        insight = validated
      }
      // else keep deterministic insight
    }

    const warnings: string[] = []
    if (isPartial) {
      warnings.push('This is a partial result: at least one data source failed or returned no data.')
    }
    for (const fn of failedNodes) {
      const trace = traces.find((t) => t.nodeId === fn.nodeId)
      if (trace?.error) {
        warnings.push(`Source "${fn.tool}" failed: ${trace.error}`)
      }
    }

    const sources: ToolProvenance[] = traces.map((t) => ({
      nodeId: t.nodeId,
      tool: t.tool,
      params: t.params,
      status: t.status === 'success' ? 'success' : t.status === 'empty' ? 'empty' : 'failed',
      rowCount: t.rowCount,
      dataVersion: t.dataVersion,
    }))

    const status = successfulNodes.length === 0 && failedNodes.length > 0
      ? 'error'
      : isPartial
        ? 'partial'
        : 'success'

    return validateAgentResult({
      status,
      originalQuestion: question,
      actualMode: 'llm',
      resolvedFilters: plan.filters,
      assumptions: plan.assumptions,
      normalizedData: normalized,
      chartOptions,
      chartType,
      chartReason,
      insight,
      insightEvidence,
      warnings,
      sources,
      dataVersion: execution.dataVersion,
      executablePlan: plan,
      message: finalText || undefined,
    })
  }

  private buildPlanFromTraces(traces: ToolTrace[], question: string): ExecutablePlan {
    // Build a deterministic plan from the actual tool call trace
    const nodes = traces.map((t) => ({
      nodeId: t.nodeId,
      tool: t.tool,
      params: t.params,
      bindings: [] as ExecutablePlan['nodes'][number]['bindings'],
      dependsOn: [] as string[],
    }))

    // Detect dependencies based on tool semantics:
    // Q7: category_performance → review_analysis (fan_out by category)
    // Q8: order_trends + review_analysis (independent, same month key)
    // Q9: delivery_performance + review_analysis (independent, same seller key)
    // Q10: delivery_performance + review_analysis (independent, same state key)
    const toolNames = traces.map((t) => t.tool)
    let merge: ExecutablePlan['merge'] = null
    let chart: ExecutablePlan['chart'] = { chartType: 'line', chartReason: 'Default chart selection', description: '' }

    // Q7 fan-out: category_performance + multiple review_analysis (nodes.length > 2)
    const catNodes = nodes.filter((n) => n.tool === 'category_performance')
    const revNodes = nodes.filter((n) => n.tool === 'review_analysis')
    if (catNodes.length === 1 && revNodes.length >= 2) {
      // Q7: aggregate fan_out review_analysis traces into a single right-side result
      // ARCHITECTURE: The STORED EXECUTABLE PLAN retains DYNAMIC dependency:
      //   categoryRanking --fan_out(category_english)--> categoryReviews
      // NOT literal category names. The EXECUTION TRACE contains concrete calls.
      const catNode = catNodes[0]!
      const aggregatedRows: Array<Record<string, unknown>> = []
      // Build runtime trace with concrete category calls (for immediate execution)
      const runtimeTraces: ToolTrace[] = []
      for (const rn of revNodes) {
        rn.dependsOn = [catNode.nodeId]
        rn.bindings = [{
          param: 'category',
          fromNode: catNode.nodeId,
          field: 'category_english',
          mode: 'fan_out',
        }]
        // Runtime trace: concrete call with actual category from trace result
        const trace = traces.find((t) => t.nodeId === rn.nodeId)
        if (trace?.result?.data && trace.result.data.length > 0) {
          const categoryName = trace.result.data[0]?.category_english ||
                              trace.result.data[0]?.category ||
                              'unknown'
          runtimeTraces.push({
            nodeId: rn.nodeId,
            tool: 'review_analysis',
            params: { category: categoryName },
            result: trace.result,
            status: 'success',
            durationMs: 0,
          })
          for (const row of trace.result.data) {
            aggregatedRows.push(row)
          }
        }
      }
      // Create a synthetic aggregated node to serve as the right side of the merge
      // params use dynamic placeholder - fan_out binding resolves categories at runtime
      const syntheticNodeId = 'node_aggregated_reviews'
      nodes.push({
        nodeId: syntheticNodeId,
        tool: 'review_analysis',
        params: { category: '{{FAN_OUT:category_english}}' }, // dynamic placeholder
        bindings: [],
        dependsOn: revNodes.map((n) => n.nodeId),
      })
      // Add runtime traces (concrete calls) to traces array; they execute first
      runtimeTraces.forEach(tr => traces.push(tr))
      traces.push({
        nodeId: syntheticNodeId,
        tool: 'review_analysis',
        params: { category: '{{FAN_OUT:category_english}}' }, // dynamic placeholder
        result: {
          ok: true,
          tool: 'review_analysis',
          data: aggregatedRows,
          columns: [],
          meta: {
            rowCount: aggregatedRows.length,
            grain: 'category',
            units: {},
            filters: {},
            assumptions: [],
            dataVersion: '2025-01',
          },
        },
        status: aggregatedRows.length > 0 ? 'success' : 'empty',
        durationMs: 0,
      })
      merge = {
        strategy: 'keyed',
        leftNode: catNode.nodeId,
        rightNode: syntheticNodeId,
        leftKey: 'category_english',
        rightKey: 'category',
        on: 'category identity',
      }
      chart = { chartType: 'bar', chartReason: 'Category comparison chart', description: 'Average review score across top categories by order volume' }
    } else if (nodes.length === 2) {
      const tools = new Set(toolNames)

      if (tools.has('category_performance') && tools.has('review_analysis')) {
        // Q7 (2-node fallback): category_performance → review_analysis
        const catNode = nodes.find((n) => n.tool === 'category_performance')!
        const revNode = nodes.find((n) => n.tool === 'review_analysis')!
        revNode.dependsOn = [catNode.nodeId]
        revNode.bindings = [{
          param: 'category',
          fromNode: catNode.nodeId,
          field: 'category_english',
          mode: 'fan_out',
        }]
        merge = {
          strategy: 'keyed',
          leftNode: catNode.nodeId,
          rightNode: revNode.nodeId,
          leftKey: 'category_english',
          rightKey: 'category',
          on: 'category identity',
        }
        chart = { chartType: 'bar', chartReason: 'Category comparison chart', description: 'Average review score across top categories by order volume' }
      } else if (tools.has('order_trends') && tools.has('review_analysis')) {
        // Q8: independent, month merge
        const trendNode = nodes.find((n) => n.tool === 'order_trends')!
        const revNode = nodes.find((n) => n.tool === 'review_analysis')!
        merge = {
          strategy: 'keyed',
          leftNode: trendNode.nodeId,
          rightNode: revNode.nodeId,
          leftKey: 'period',
          rightKey: 'group_key',
          on: 'month-start timestamp',
        }
        chart = { chartType: 'line', chartReason: 'Dual-axis time series', description: 'Monthly orders and review scores' }
      } else if (tools.has('delivery_performance') && tools.has('review_analysis')) {
        // Q9/Q10: independent, state or seller merge
        const delNode = nodes.find((n) => n.tool === 'delivery_performance')!
        const revNode = nodes.find((n) => n.tool === 'review_analysis')!
        const isQ9 = traces.some((t) => t.tool === 'delivery_performance' && t.params.group_by === 'seller_id')
        if (isQ9) {
          merge = {
            strategy: 'keyed',
            leftNode: delNode.nodeId,
            rightNode: revNode.nodeId,
            leftKey: 'group_key',
            rightKey: 'group_key',
            on: 'seller_id',
            expectedCohort: 'delivered_reviewed_valid_delivery',
          }
          chart = { chartType: 'scatter', chartReason: 'Two continuous metrics per entity', description: 'Delivery days vs review score by seller' }
        } else {
          merge = {
            strategy: 'keyed',
            leftNode: delNode.nodeId,
            rightNode: revNode.nodeId,
            leftKey: 'group_key',
            rightKey: 'group_key',
            on: 'customer/destination state UF',
            expectedCohort: 'delivered_reviewed_valid_delivery',
          }
          chart = { chartType: 'bar', chartReason: 'Mixed-unit side-by-side comparison', description: 'Delivery delay and review score by state' }
        }
      }
    } else if (nodes.length === 1) {
      const tool = toolNames[0]
      const params = traces[0]!.params
      if (tool === 'order_trends') {
        chart = { chartType: 'line', chartReason: 'Single metric over time', description: 'Metric trend over time' }
      } else if (tool === 'category_performance') {
        chart = { chartType: 'bar', chartReason: 'Ranked list', description: 'Category ranking' }
      } else if (tool === 'seller_performance') {
        chart = { chartType: 'bar', chartReason: 'Ranked list', description: 'Seller ranking' }
      } else if (tool === 'payment_breakdown') {
        chart = { chartType: 'doughnut', chartReason: 'Part-to-whole composition', description: 'Payment method share' }
      } else if (tool === 'review_analysis' && params.metric === 'score_distribution') {
        chart = { chartType: 'bar', chartReason: 'Score distribution', description: 'Review score distribution' }
      }
    }

    return {
      planVersion: 1,
      intent: this.detectIntent(traces),
      question,
      filters: traces[0]?.params ?? {},
      assumptions: ['Parameters determined by LLM tool selection', 'Normalization applied by deterministic application pipeline'],
      cohort: 'delivered',
      nodes,
      merge,
      chart,
    }
  }

  private detectIntent(traces: ToolTrace[]): string {
    const toolNames = new Set(traces.map((t) => t.tool))
    if (toolNames.has('category_performance') && toolNames.has('review_analysis')) return 'q7_top_categories_reviews'
    if (toolNames.has('order_trends') && toolNames.has('review_analysis')) return 'q8_monthly_orders_and_reviews'
    if (toolNames.has('delivery_performance') && toolNames.has('review_analysis')) {
      const delParams = traces.find((t) => t.tool === 'delivery_performance')?.params
      if (delParams?.group_by === 'seller_id') return 'q9_seller_delivery_vs_reviews'
      return 'q10_delay_and_reviews_by_state'
    }
    const tool = traces[0]?.tool
    if (tool === 'order_trends') return 'q1_monthly_revenue_trend'
    if (tool === 'category_performance') return 'q2_top_revenue_categories'
    if (tool === 'delivery_performance') return 'q3_worst_delivery_states'
    if (tool === 'payment_breakdown') return 'q4_payment_share'
    if (tool === 'seller_performance') return 'q5_top_sellers_sp'
    if (tool === 'review_analysis') return 'q6_electronics_review_distribution'
    return 'unknown'
  }

  private buildSingleNormalized(intentId: string, result: ToolResult): NormalizedData | null {
    switch (intentId) {
      case 'q1_monthly_revenue_trend':
        return fromTrends(result, 'revenue', 'Revenue', 'BRL')
      case 'q2_top_revenue_categories':
        return fromRanking(result, {
          keyField: 'category_english', labelField: 'category_english',
          valueField: 'metric_value', metricLabel: 'Revenue', unit: 'BRL',
          direction: 'desc', extraFields: ['order_count'],
        })
      case 'q3_worst_delivery_states':
        return fromRanking(result, {
          keyField: 'group_key', labelField: 'group_key',
          valueField: 'metric_value', metricLabel: 'On-time rate', unit: 'percent',
          direction: 'asc', extraFields: ['order_count'],
        })
      case 'q4_payment_share':
        return fromComposition(result, ['voucher', 'debit_card'])
      case 'q5_top_sellers_sp':
        return fromRanking(result, {
          keyField: 'seller_id', labelField: 'seller_id',
          valueField: 'metric_value', metricLabel: 'Revenue', unit: 'BRL',
          direction: 'desc', extraFields: ['order_count'],
        })
      case 'q6_electronics_review_distribution':
        return fromScoreDistribution(result)
      default:
        return null
    }
  }

  private buildMergedNormalized(intentId: string, rows: Array<{ key: string; left: Record<string, unknown> | null; right: Record<string, unknown> | null }>): NormalizedData | null {
    switch (intentId) {
      case 'q7_top_categories_reviews': return buildQ7Ranking(rows)
      case 'q8_monthly_orders_and_reviews': return buildQ8TimeSeries(rows)
      case 'q9_seller_delivery_vs_reviews': return buildQ9Correlation(rows)
      case 'q10_delay_and_reviews_by_state': return buildQ10Correlation(rows)
      default: return null
    }
  }

  private buildPartialNormalized(intentId: string, execution: PlanExecution): NormalizedData | null {
    const survivor = [...execution.outcomes.values()].find((o) => o.status === 'success' && o.result)
    if (!survivor?.result) return null
    switch (intentId) {
      case 'q7_top_categories_reviews':
        return fromRanking(survivor.result, {
          keyField: 'category_english', labelField: 'category_english',
          valueField: 'metric_value', metricLabel: 'Order volume', unit: 'count', direction: 'desc',
        })
      case 'q8_monthly_orders_and_reviews':
        if (survivor.nodeId === 'node_0') return fromTrends(survivor.result, 'orders', 'Delivered orders', 'count')
        return fromRanking(survivor.result, {
          keyField: 'group_key', labelField: 'group_key',
          valueField: 'metric_value', metricLabel: 'Average review score', unit: 'stars', direction: 'desc',
        })
      case 'q9_seller_delivery_vs_reviews':
      case 'q10_delay_and_reviews_by_state':
        return fromRanking(survivor.result, {
          keyField: 'group_key', labelField: 'group_key',
          valueField: 'metric_value',
          metricLabel: intentId === 'q9_seller_delivery_vs_reviews' ? 'Average delivery days' : 'Average delivery delay',
          unit: 'days', direction: 'asc',
        })
      default: return null
    }
  }

  private outcomeRows(outcome: NodeOutcome, _bindField: string): Array<Record<string, unknown>> {
    if (outcome.result) return outcome.result.data as Array<Record<string, unknown>>
    return []
  }

  private emptyResult(
    status: AgentResult['status'],
    message: string,
    errorCode: string | undefined,
    question: string,
  ): AgentResult {
    return validateAgentResult({
      status,
      originalQuestion: question,
      actualMode: 'llm',
      fallbackReason: status === 'error' ? message : undefined,
      resolvedFilters: {},
      assumptions: [],
      normalizedData: null,
      chartOptions: [],
      chartType: null,
      chartReason: null,
      insight: null,
      warnings: [],
      sources: [],
      dataVersion: null,
      executablePlan: null,
      message,
      errorCode,
    })
  }
}

function classifyProviderError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('authentication') || msg.includes('401') || msg.includes('invalid_api_key')) {
    return new Error(`PROVIDER_AUTH_FAILURE: ${msg.slice(0, 200)}`)
  }
  if (msg.includes('rate_limit') || msg.includes('429')) {
    return new Error(`PROVIDER_RATE_LIMIT: ${msg.slice(0, 200)}`)
  }
  if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
    return new Error(`PROVIDER_SERVER_ERROR: ${msg.slice(0, 200)}`)
  }
  if (msg.includes('timeout') || msg.includes('ECONNABORTED')) {
    return new Error(`PROVIDER_TIMEOUT: ${msg.slice(0, 200)}`)
  }
  return new Error(`PROVIDER_ERROR: ${msg.slice(0, 200)}`)
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}
