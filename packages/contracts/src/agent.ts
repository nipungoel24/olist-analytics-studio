import { z } from 'zod'
import { ChartConfigSchema } from './chart.js'
import { NormalizedDataSchema } from './analysis.js'
import { ExecutablePlanSchema } from './plan.js'

export const ANALYSIS_STATUSES = [
  'success',
  'partial',
  'empty',
  'unsupported',
  'needs_clarification',
  'error',
] as const

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number]

export const AGENT_MODES = ['llm', 'fallback'] as const
export type AgentMode = (typeof AGENT_MODES)[number]

export const ToolProvenanceSchema = z.object({
  nodeId: z.string(),
  tool: z.string(),
  params: z.record(z.string(), z.unknown()),
  status: z.enum(['success', 'failed', 'empty']),
  rowCount: z.number().optional(),
  dataVersion: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
})

export const InsightEvidenceSchema = z.object({
  operation: z.enum(['max', 'min', 'share', 'count', 'descriptive_comparison', 'peak']),
  key: z.string().optional(),
  metric: z.string(),
  value: z.number(),
  rowsUsed: z.number(),
})

export const AgentResultSchema = z.object({
  status: z.enum(ANALYSIS_STATUSES),
  analysisId: z.string().optional(),
  originalQuestion: z.string(),
  actualMode: z.enum(AGENT_MODES),
  fallbackReason: z.string().optional(),
  resolvedFilters: z.record(z.string(), z.unknown()),
  assumptions: z.array(z.string()),
  normalizedData: NormalizedDataSchema.nullable(),
  chartOptions: z.array(ChartConfigSchema),
  chartType: z.string().nullable(),
  chartReason: z.string().nullable(),
  insight: z.string().nullable(),
  insightEvidence: z.array(InsightEvidenceSchema).optional(),
  warnings: z.array(z.string()),
  sources: z.array(ToolProvenanceSchema),
  dataVersion: z.string().nullable(),
  executablePlan: ExecutablePlanSchema.nullable(),
  message: z.string().optional(),
  errorCode: z.string().optional(),
})

export type ToolProvenance = z.infer<typeof ToolProvenanceSchema>
export type InsightEvidence = z.infer<typeof InsightEvidenceSchema>
export type AgentResult = z.infer<typeof AgentResultSchema>

export function validateAgentResult(result: unknown): AgentResult {
  return AgentResultSchema.parse(result)
}
