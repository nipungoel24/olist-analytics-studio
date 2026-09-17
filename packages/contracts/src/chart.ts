import { z } from 'zod'

// JSON-safe Chart.js configuration allowlist.
// No functions, callbacks, plugin code, HTML or executable JS can ever pass this schema.
// Every config must survive JSON.stringify -> JSON.parse -> schema validation without loss.

export const CHART_TYPES = ['line', 'bar', 'doughnut', 'scatter'] as const
export type ChartType = (typeof CHART_TYPES)[number]

const ScatterPointSchema = z.object({
  x: z.union([z.number(), z.null()]),
  y: z.union([z.number(), z.null()]),
  key: z.string(),
})

export const ChartDatasetSchema = z.object({
  label: z.string(),
  data: z.union([
    z.array(z.union([z.number(), z.null()])),
    z.array(ScatterPointSchema),
  ]),
  yAxisID: z.string().optional(),
  backgroundColor: z.union([z.string(), z.array(z.string())]).optional(),
  borderColor: z.string().optional(),
  fill: z.boolean().optional(),
  tension: z.number().optional(),
  indexAxis: z.enum(['x', 'y']).optional(),
  stack: z.string().optional(),
})

export const ChartScaleSchema = z.object({
  type: z.enum(['linear', 'category']).optional(),
  position: z.enum(['left', 'right', 'top', 'bottom']).optional(),
  stacked: z.boolean().optional(),
  title: z.object({ display: z.literal(true), text: z.string() }).optional(),
})

export const ChartConfigSchema = z.object({
  id: z.string(),
  type: z.enum(CHART_TYPES),
  title: z.string(),
  description: z.string().optional(),
  data: z.object({
    labels: z.array(z.string()),
    datasets: z.array(ChartDatasetSchema),
  }),
  options: z
    .object({
      indexAxis: z.enum(['x', 'y']).optional(),
      responsive: z.literal(true).optional(),
      scales: z.record(z.string(), ChartScaleSchema).optional(),
      plugins: z
        .object({
          title: z.object({ display: z.literal(true), text: z.string() }).optional(),
        })
        .optional(),
    })
    .optional(),
})

export type ChartConfig = z.infer<typeof ChartConfigSchema>
export type ChartDataset = z.infer<typeof ChartDatasetSchema>

export function validateChartConfig(config: unknown): ChartConfig {
  return ChartConfigSchema.parse(config)
}

export function assertJsonRoundTrip(config: ChartConfig): ChartConfig {
  const roundTripped = JSON.parse(JSON.stringify(config)) as unknown
  return ChartConfigSchema.parse(roundTripped)
}
