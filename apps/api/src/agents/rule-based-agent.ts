import type { AgentResult, NormalizedData, ToolProvenance, ToolResult } from '@olist/contracts'
import { validateAgentResult, type ExecutablePlan } from '@olist/contracts'
import type { ILLMAgent, AgentRunInput } from './interface.js'
import type { ToolCallAdapter } from '../mcp/adapter.js'
import { matchIntent } from '../analysis/intents.js'
import { detectUnsupported, SUPPORTED_DOMAIN_MESSAGE } from '../analysis/normalizer.js'
import { executePlan, type PlanExecution, type NodeOutcome } from '../analysis/executor.js'
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
import { fallbackChartOptions } from '../analysis/charts/fallback.js'
import { buildInsight } from '../analysis/insight.js'

export interface RuleBasedAgentDeps {
  adapter: ToolCallAdapter
  fallbackTimeoutMs: number
  toolTimeoutMs: number
  maxRequestLength: number
  logger?: (msg: string) => void
}

function provenanceFrom(execution: PlanExecution, plan: ExecutablePlan): ToolProvenance[] {
  const sources: ToolProvenance[] = []
  for (const node of plan.nodes) {
    const outcome = execution.outcomes.get(node.nodeId)
    if (!outcome) continue
    sources.push({
      nodeId: outcome.nodeId,
      tool: outcome.tool,
      params: outcome.params,
      status: outcome.status === 'success' ? 'success' : outcome.status === 'empty' ? 'empty' : 'failed',
      rowCount: outcome.rowCount,
      dataVersion: outcome.dataVersion,
      errorCode: outcome.errorCode,
      errorMessage: outcome.errorMessage,
    })
  }
  return sources
}

export class RuleBasedAgent implements ILLMAgent {
  readonly mode = 'fallback' as const

  constructor(private readonly deps: RuleBasedAgentDeps) {}

  async run(input: AgentRunInput): Promise<AgentResult> {
    const { question, requestId, signal } = input
    const log = this.deps.logger
    if (log) log(`[fallback] request ${requestId} question: ${question.slice(0, 120)}`)

    const emptyResult = (status: AgentResult['status'], message: string, errorCode?: string): AgentResult =>
      this.assemble({
        status,
        originalQuestion: question,
        actualMode: 'fallback',
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

    if (question.trim().length === 0) {
      return emptyResult('error', 'Question must not be empty.', 'INVALID_INPUT')
    }
    if (question.length > this.deps.maxRequestLength) {
      return emptyResult(
        'error',
        `Question exceeds the maximum length of ${this.deps.maxRequestLength} characters.`,
        'REQUEST_TOO_LONG'
      )
    }

    const intent = matchIntent(question)
    if (!intent) {
      const unsupported = detectUnsupported(question)
      const reason = unsupported
        ? `This question cannot be answered with the Olist dataset: ${unsupported.reason}.`
        : 'This question is outside the supported analytics domain.'
      return emptyResult('unsupported', `${reason} ${SUPPORTED_DOMAIN_MESSAGE}`)
    }

    const plan = intent.buildPlan(question)

    const execution = await executePlan(
      plan,
      {
        adapter: this.deps.adapter,
        overallDeadlineMs: this.deps.fallbackTimeoutMs,
        toolTimeoutMs: this.deps.toolTimeoutMs,
        logger: this.deps.logger,
      },
      signal
    )

    const successfulNodes = plan.nodes.filter(
      (n) => execution.outcomes.get(n.nodeId)?.status === 'success'
    )
    const failedNodes = plan.nodes.filter((n) => execution.outcomes.get(n.nodeId)?.status === 'failed')
    const emptyNodes = plan.nodes.filter((n) => execution.outcomes.get(n.nodeId)?.status === 'empty')

    // All sources failed -> error
    if (successfulNodes.length === 0 && failedNodes.length > 0) {
      const first = execution.outcomes.get(failedNodes[0]!.nodeId)
      return emptyResult(
        'error',
        first?.errorMessage ?? 'The analysis failed because its data source failed.',
        first?.errorCode ?? 'INTERNAL_ERROR'
      )
    }

    // Single-node plan with an empty source -> empty (valid filter, no data)
    if (successfulNodes.length === 0 && emptyNodes.length > 0) {
      const first = execution.outcomes.get(emptyNodes[0]!.nodeId)
      const filtersText = Object.entries(plan.filters)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', ')
      return {
        ...emptyResult(
          'empty',
          first?.errorMessage ?? 'No data matched the requested filters.',
          first?.errorCode ?? 'EMPTY_RESULT'
        ),
        resolvedFilters: plan.filters,
        assumptions: plan.assumptions,
        executablePlan: plan,
        message: `No data matched the requested filters${filtersText ? ` (${filtersText})` : ''}. ${first?.errorMessage ?? ''}`,
      }
    }

    const isPartial = failedNodes.length > 0 || emptyNodes.length > 0

    // Build normalized data
    let normalized: NormalizedData | null = null
    let warnings: string[] = []

    if (plan.merge) {
      const leftOutcome = execution.outcomes.get(plan.merge.leftNode)
      const rightOutcome = execution.outcomes.get(plan.merge.rightNode)
      if (leftOutcome?.status === 'success' && rightOutcome?.status === 'success') {
        const leftRows = this.outcomeRows(leftOutcome, plan.merge.leftKey)
        const rightRows = this.outcomeRows(rightOutcome, plan.merge.rightKey)
        const mergeResult = keyedMerge(leftRows, rightRows, plan.merge)
        warnings = mergeResult.warnings
        normalized = this.buildMergedNormalized(plan.intent, mergeResult.rows)
      } else {
        // Partial: preserve the surviving source truthfully; chart stays null
        normalized = this.buildPartialNormalized(plan.intent, execution)
        for (const n of failedNodes) {
          warnings.push(`Source "${n.nodeId}" failed: ${execution.outcomes.get(n.nodeId)?.errorMessage ?? 'unknown error'}`)
        }
        for (const n of emptyNodes) {
          warnings.push(`Source "${n.nodeId}" returned no data: ${execution.outcomes.get(n.nodeId)?.errorMessage ?? 'empty result'}`)
        }
      }
    } else {
      const node = plan.nodes[0]
      const outcome = node ? execution.outcomes.get(node.nodeId) : undefined
      if (outcome?.status === 'success' && outcome.result) {
        normalized = this.buildSingleNormalized(plan.intent, outcome.result)
      }
    }

    if (!normalized) {
      return {
        ...emptyResult('error', 'No usable data could be produced for this analysis.', 'INTERNAL_ERROR'),
        resolvedFilters: plan.filters,
        assumptions: plan.assumptions,
        executablePlan: plan,
        warnings,
      }
    }

    // Fallback bar-only charts; unsupported shapes have no chart
    let chartOptions: AgentResult['chartOptions'] = []
    let chartType: string | null = null
    let chartReason: string | null = null
    if (!isPartial || this.canChartPartial(plan.intent, normalized)) {
      const charts = fallbackChartOptions(normalized, plan.intent)
      chartOptions = charts.options
      chartType = charts.chartType
      chartReason = charts.chartReason
    }

    const insightResult = buildInsight(normalized, plan.intent)

    if (isPartial) {
      warnings.push('This is a partial result: at least one required data source failed or returned no data.')
    }

    return this.assemble({
      status: isPartial ? 'partial' : 'success',
      originalQuestion: question,
      actualMode: 'fallback',
      resolvedFilters: plan.filters,
      assumptions: plan.assumptions,
      normalizedData: normalized,
      chartOptions,
      chartType,
      chartReason,
      insight: insightResult.text,
      insightEvidence: insightResult.evidence,
      warnings,
      sources: provenanceFrom(execution, plan),
      dataVersion: execution.dataVersion,
      executablePlan: plan,
      message: isPartial
        ? 'The analysis completed partially; some sources failed or returned no data. See warnings.'
        : undefined,
    })
  }

  private canChartPartial(_intentId: string, _normalized: NormalizedData): boolean {
    // Multi-tool comparisons require both dimensions for a truthful chart;
    // partial multi-tool results therefore have no chart (guardrail §16/§57).
    return false
  }

  private outcomeRows(outcome: NodeOutcome, bindField: string): Array<Record<string, unknown>> {
    if (outcome.result) {
      return outcome.result.data as Array<Record<string, unknown>>
    }
    if (outcome.boundResults) {
      return outcome.boundResults.flatMap((b) =>
        (b.result.data as Array<Record<string, unknown>>).map((row) => ({ ...row, [bindField]: b.key }))
      )
    }
    return []
  }

  private buildSingleNormalized(intentId: string, result: ToolResult): NormalizedData {
    switch (intentId) {
      case 'q1_monthly_revenue_trend':
        return fromTrends(result, 'revenue', 'Revenue', 'BRL')
      case 'q2_top_revenue_categories':
        return fromRanking(result, {
          keyField: 'category_english',
          labelField: 'category_english',
          valueField: 'metric_value',
          metricLabel: 'Revenue',
          unit: 'BRL',
          direction: 'desc',
          extraFields: ['order_count'],
        })
      case 'q3_worst_delivery_states':
        return fromRanking(result, {
          keyField: 'group_key',
          labelField: 'group_key',
          valueField: 'metric_value',
          metricLabel: 'On-time rate',
          unit: 'percent',
          direction: 'asc',
          extraFields: ['order_count'],
        })
      case 'q4_payment_share':
        return fromComposition(result, ['voucher', 'debit_card'])
      case 'q5_top_sellers_sp':
        return fromRanking(result, {
          keyField: 'seller_id',
          labelField: 'seller_id',
          valueField: 'metric_value',
          metricLabel: 'Revenue',
          unit: 'BRL',
          direction: 'desc',
          extraFields: ['order_count'],
        })
      case 'q6_electronics_review_distribution':
        return fromScoreDistribution(result)
      default:
        throw new Error(`no single-node builder for intent ${intentId}`)
    }
  }

  private buildMergedNormalized(intentId: string, rows: Array<{ key: string; left: Record<string, unknown> | null; right: Record<string, unknown> | null }>): NormalizedData {
    switch (intentId) {
      case 'q7_top_categories_reviews':
        return buildQ7Ranking(rows)
      case 'q8_monthly_orders_and_reviews':
        return buildQ8TimeSeries(rows)
      case 'q9_seller_delivery_vs_reviews':
        return buildQ9Correlation(rows)
      case 'q10_delay_and_reviews_by_state':
        return buildQ10Correlation(rows)
      default:
        throw new Error(`no merged builder for intent ${intentId}`)
    }
  }

  private buildPartialNormalized(intentId: string, execution: PlanExecution): NormalizedData | null {
    const survivor = [...execution.outcomes.values()].find((o) => o.status === 'success' && o.result)
    if (!survivor?.result) return null
    switch (intentId) {
      case 'q7_top_categories_reviews':
        return fromRanking(survivor.result, {
          keyField: 'category_english',
          labelField: 'category_english',
          valueField: 'metric_value',
          metricLabel: 'Order volume',
          unit: 'count',
          direction: 'desc',
        })
      case 'q8_monthly_orders_and_reviews':
        if (survivor.nodeId === 'monthlyOrders') {
          return fromTrends(survivor.result, 'orders', 'Delivered orders', 'count')
        }
        if (survivor.nodeId === 'monthlyScores') {
          return fromRanking(survivor.result, {
            keyField: 'group_key',
            labelField: 'group_key',
            valueField: 'metric_value',
            metricLabel: 'Average review score',
            unit: 'stars',
            direction: 'desc',
          })
        }
        return null
      case 'q9_seller_delivery_vs_reviews':
      case 'q10_delay_and_reviews_by_state':
        return fromRanking(survivor.result, {
          keyField: 'group_key',
          labelField: 'group_key',
          valueField: 'metric_value',
          metricLabel: intentId === 'q9_seller_delivery_vs_reviews' ? 'Average delivery days' : 'Average delivery delay',
          unit: 'days',
          direction: 'asc',
        })
      default:
        return null
    }
  }

  private assemble(result: AgentResult): AgentResult {
    return validateAgentResult(result)
  }
}
