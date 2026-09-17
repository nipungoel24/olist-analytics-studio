import { z } from 'zod'

// Pin and refresh contracts for Phase 5 persistence.
// These extend the existing schema model without duplicating it.

// Schema reconciliation:
// - analyses: Immutable analysis entity (question, ExecutablePlan, agent_mode)
// - analysis_snapshots: Immutable snapshot of execution results (data, charts, insights)
// - pins: Analyst-pinned analyses (points to analysis + latest successful snapshot)
// - refresh_runs: Append-only history of refresh attempts

export const PinStatusSchema = z.enum(['active', 'deleted'])
export type PinStatus = z.infer<typeof PinStatusSchema>

export const RefreshStatusSchema = z.enum([
  'success',
  'partial',
  'failed',
  'not_comparable',
  'conflict',
])
export type RefreshStatus = z.infer<typeof RefreshStatusSchema>

// Pin eligibility based on analysis status
export const PINNABLE_STATUSES = ['success', 'partial'] as const
export type PinnableStatus = (typeof PINNABLE_STATUSES)[number]

// Request schema for POST /api/pins
// Server trust boundary: browser cannot provide analytical truth
export const CreatePinRequestSchema = z.object({
  analysisId: z.string().uuid(),
  chartOptionId: z.number().int().min(0).optional(),
  title: z.string().max(200).optional(),
})
export type CreatePinRequest = z.infer<typeof CreatePinRequestSchema>

// Pin response schema
export const PinSchema = z.object({
  pinId: z.string().uuid(),
  analysisId: z.string().uuid(),
  latestSnapshotId: z.string().uuid(),
  chosenChartOption: z.number().int().min(0),
  planVersion: z.number().int().min(1),
  title: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Pin = z.infer<typeof PinSchema>

// Pin with snapshot data for GET /api/pins
export const PinWithSnapshotSchema = PinSchema.extend({
  originalQuestion: z.string(),
  executablePlan: z.unknown(),
  agentMode: z.string(),
  dataVersion: z.string().nullable(),
  resolvedFilters: z.record(z.string(), z.unknown()),
  assumptions: z.array(z.string()),
  dataSnapshot: z.unknown(),
  chartOptions: z.array(z.unknown()),
  insight: z.string().nullable(),
  warnings: z.array(z.string()),
  snapshotStatus: z.string(),
  snapshotCreatedAt: z.string().datetime(),
  lastRefreshStatus: z.string().nullable(),
  lastRefreshAt: z.string().datetime().nullable(),
})
export type PinWithSnapshot = z.infer<typeof PinWithSnapshotSchema>

// Refresh run schema
export const RefreshRunSchema = z.object({
  refreshId: z.string().uuid(),
  pinId: z.string().uuid(),
  previousSnapshotId: z.string().uuid().nullable(),
  newSnapshotId: z.string().uuid().nullable(),
  status: RefreshStatusSchema,
  semanticDiff: z.unknown().nullable(),
  failureReason: z.string().nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
})
export type RefreshRun = z.infer<typeof RefreshRunSchema>

// Semantic diff entry
export const DiffEntrySchema = z.object({
  dimensionKey: z.string(),
  metricId: z.string(),
  oldValue: z.union([z.number(), z.null()]),
  newValue: z.union([z.number(), z.null()]),
  absoluteChange: z.union([z.number(), z.null()]),
  relativeChange: z.union([z.number(), z.null()]),
  thresholdMet: z.boolean(),
  thresholdReason: z.string(),
})
export type DiffEntry = z.infer<typeof DiffEntrySchema>

// Structural changes
export const StructuralChangeSchema = z.object({
  type: z.enum(['entity_added', 'entity_removed', 'top_n_membership_change']),
  key: z.string(),
  details: z.string().optional(),
})
export type StructuralChange = z.infer<typeof StructuralChangeSchema>

// Full semantic diff result
export const SemanticDiffSchema = z.object({
  status: z.enum(['unchanged', 'changed', 'not_comparable', 'failed']),
  diffs: z.array(DiffEntrySchema),
  structuralChanges: z.array(StructuralChangeSchema),
  previousDataVersion: z.string().nullable(),
  newDataVersion: z.string().nullable(),
  previousStatus: z.string(),
  newStatus: z.string(),
})
export type SemanticDiff = z.infer<typeof SemanticDiffSchema>

// Refresh result
export const RefreshResultSchema = z.object({
  refreshId: z.string().uuid(),
  pinId: z.string().uuid(),
  status: RefreshStatusSchema,
  diff: SemanticDiffSchema.nullable(),
  previousSnapshotId: z.string().uuid(),
  newSnapshotId: z.string().uuid().nullable(),
  planVersion: z.number().int(),
  error: z.string().optional(),
})
export type RefreshResult = z.infer<typeof RefreshResultSchema>

// Validate pin eligibility
export function isPinnable(status: string): boolean {
  return (PINNABLE_STATUSES as readonly string[]).includes(status)
}

// Validate chart option belongs to result
export function isValidChartOption(
  chartOptions: unknown[],
  chartOptionId: number | undefined
): boolean {
  if (chartOptionId === undefined) return true
  return chartOptionId >= 0 && chartOptionId < chartOptions.length
}
