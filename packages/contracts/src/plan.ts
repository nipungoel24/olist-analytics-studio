import { z } from 'zod'

// ExecutablePlan: versioned deterministic semantics for refresh/pinning.
// No executable code, no raw SQL, no provider prompt text, no model reasoning.

export const PLAN_VERSION = 1

export const PlanNodeSchema = z.object({
  nodeId: z.string(),
  tool: z.string(),
  params: z.record(z.string(), z.unknown()),
  bindings: z
    .array(
      z.object({
        param: z.string(),
        fromNode: z.string(),
        field: z.string(),
        mode: z.enum(['value', 'fan_out']),
      })
    )
    .default([]),
  dependsOn: z.array(z.string()).default([]),
})

export const MergeRecipeSchema = z.object({
  strategy: z.literal('keyed'),
  leftNode: z.string(),
  rightNode: z.string(),
  leftKey: z.string(),
  rightKey: z.string(),
  on: z.string(),
  expectedCohort: z.string().optional(),
})

export const ChartPanelSpecSchema = z.object({
  seriesKey: z.string().optional(),
  label: z.string(),
  unit: z.string(),
  description: z.string().optional(),
})

export const ChartSemanticsSchema = z.object({
  chartType: z.string(),
  chartReason: z.string(),
  panels: z.array(ChartPanelSpecSchema).optional(),
  description: z.string().optional(),
})

export const ExecutablePlanSchema = z.object({
  planVersion: z.literal(PLAN_VERSION),
  intent: z.string(),
  question: z.string(),
  filters: z.record(z.string(), z.unknown()),
  assumptions: z.array(z.string()),
  cohort: z.string(),
  nodes: z.array(PlanNodeSchema),
  merge: MergeRecipeSchema.nullable(),
  chart: ChartSemanticsSchema,
})

export type PlanNode = z.infer<typeof PlanNodeSchema>
export type MergeRecipe = z.infer<typeof MergeRecipeSchema>
export type ChartSemantics = z.infer<typeof ChartSemanticsSchema>
export type ExecutablePlan = z.infer<typeof ExecutablePlanSchema>

export function validateExecutablePlan(plan: unknown): ExecutablePlan {
  return ExecutablePlanSchema.parse(plan)
}

export function assertNoExecutableContent(plan: ExecutablePlan): boolean {
  const serialized = JSON.stringify(plan)
  return (
    serialized.length < 200_000 &&
    !plan.nodes.some((n) => typeof n.params !== 'object' || n.params === null || Array.isArray(n.params))
  )
}
