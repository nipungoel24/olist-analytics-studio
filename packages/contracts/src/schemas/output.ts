import { z } from 'zod'

export const ColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  unit: z.string().optional(),
})

export const ToolResultSchema = z.object({
  ok: z.literal(true),
  tool: z.string(),
  data: z.array(z.record(z.string(), z.unknown())),
  columns: z.array(ColumnSchema),
  meta: z.object({
    rowCount: z.number(),
    grain: z.string(),
    units: z.record(z.string(), z.string()),
    filters: z.record(z.string(), z.unknown()),
    cohort: z.string().optional(),
    assumptions: z.array(z.string()),
    dataVersion: z.string(),
  }),
})

export const ToolErrorSchema = z.object({
  ok: z.literal(false),
  tool: z.string(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean().optional(),
  }),
})

export type ToolResult = z.infer<typeof ToolResultSchema>
export type ToolErrorResponse = z.infer<typeof ToolErrorSchema>
export type ToolResponse = ToolResult | ToolErrorResponse
