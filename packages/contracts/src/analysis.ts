import { z } from 'zod'

// Normalized analytical shapes. These separate tool-specific output from
// chart/insight generation. Everything is JSON-serializable and bounded.

export const TimeSeriesSchema = z.object({
  kind: z.literal('time_series'),
  periods: z.array(z.string()),
  series: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      unit: z.string(),
      values: z.array(z.union([z.number(), z.null()])),
    })
  ),
})

export const RankingSchema = z.object({
  kind: z.literal('ranking'),
  entities: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      metricValue: z.union([z.number(), z.null()]),
      extra: z.record(z.string(), z.unknown()).optional(),
    })
  ),
  metricLabel: z.string(),
  unit: z.string(),
  direction: z.enum(['asc', 'desc']),
})

export const CompositionSchema = z.object({
  kind: z.literal('composition'),
  parts: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.number(),
      share: z.number().optional(),
    })
  ),
  total: z.number(),
  unit: z.string(),
  denominatorNote: z.string(),
})

export const CorrelationSchema = z.object({
  kind: z.literal('correlation'),
  entities: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      x: z.union([z.number(), z.null()]),
      y: z.union([z.number(), z.null()]),
    })
  ),
  xLabel: z.string(),
  yLabel: z.string(),
  xUnit: z.string(),
  yUnit: z.string(),
  description: z.string().optional(),
})

export const DistributionSchema = z.object({
  kind: z.literal('distribution'),
  buckets: z.array(
    z.object({
      label: z.string(),
      count: z.number(),
    })
  ),
  total: z.number(),
  unit: z.string(),
})

export const NormalizedDataSchema = z.discriminatedUnion('kind', [
  TimeSeriesSchema,
  RankingSchema,
  CompositionSchema,
  CorrelationSchema,
  DistributionSchema,
])

export type TimeSeries = z.infer<typeof TimeSeriesSchema>
export type Ranking = z.infer<typeof RankingSchema>
export type Composition = z.infer<typeof CompositionSchema>
export type Correlation = z.infer<typeof CorrelationSchema>
export type Distribution = z.infer<typeof DistributionSchema>
export type NormalizedData = z.infer<typeof NormalizedDataSchema>

export function validateNormalizedData(data: unknown): NormalizedData {
  return NormalizedDataSchema.parse(data)
}
