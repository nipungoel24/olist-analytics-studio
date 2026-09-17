import { z } from 'zod'
import {
  BRAZILIAN_STATES,
  GRANULARITIES,
  SORT_ORDERS,
  ORDER_TRENDS_METRICS,
  CATEGORY_PERFORMANCE_METRICS,
  SELLER_PERFORMANCE_METRICS,
  REVIEW_ANALYSIS_METRICS,
  PAYMENT_BREAKDOWN_METRICS,
  DELIVERY_PERFORMANCE_METRICS,
  ORDER_STATUSES,
  PAYMENT_TYPES,
} from '../enums.js'

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Expected YYYY-MM-DD')

export const DateRangeSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
}).refine(
  (data) => {
    if (data.from && data.to) {
      return new Date(data.from) <= new Date(data.to)
    }
    return true
  },
  { message: 'from date must be <= to date' }
)

export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  sort: z.enum(SORT_ORDERS).default('desc'),
})

export const DatasetMetadataInputSchema = z.object({})

export const OrderTrendsInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  granularity: z.enum(GRANULARITIES).default('month'),
  metric: z.enum(ORDER_TRENDS_METRICS).default('revenue'),
  status: z.enum(ORDER_STATUSES).optional(),
  state: z.enum(BRAZILIAN_STATES).optional(),
})

export const CategoryPerformanceInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(CATEGORY_PERFORMANCE_METRICS).default('revenue'),
  category: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10),
  sort: z.enum(SORT_ORDERS).default('desc'),
  status: z.enum(ORDER_STATUSES).optional(),
})

export const SellerPerformanceInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(SELLER_PERFORMANCE_METRICS).default('revenue'),
  state: z.enum(BRAZILIAN_STATES).optional(),
  seller_id: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10),
  sort: z.enum(SORT_ORDERS).default('desc'),
  status: z.enum(ORDER_STATUSES).optional(),
})

export const ReviewAnalysisInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(REVIEW_ANALYSIS_METRICS).default('score_distribution'),
  group_by: z.enum(['none', 'month', 'state', 'seller']).default('none'),
  category: z.string().optional(),
  state: z.enum(BRAZILIAN_STATES).optional(),
  score: z.number().int().min(1).max(5).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  cohort: z.enum(['delivered_reviewed_valid_delivery']).optional(),
})

export const PaymentBreakdownInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(PAYMENT_BREAKDOWN_METRICS).default('payment_value'),
  payment_type: z.enum(PAYMENT_TYPES).optional(),
  group_by: z.enum(['payment_type', 'installments', 'month']).default('payment_type'),
})

export const DeliveryPerformanceInputSchema = z.object({
  from: DateString.optional(),
  to: DateString.optional(),
  metric: z.enum(DELIVERY_PERFORMANCE_METRICS).default('on_time_rate'),
  group_by: z.enum(['state', 'seller_state', 'seller_id', 'month']).default('state'),
  state: z.enum(BRAZILIAN_STATES).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  sort: z.enum(SORT_ORDERS).default('desc'),
  cohort: z.enum(['delivered_reviewed_valid_delivery']).optional(),
})

export type DatasetMetadataInput = z.infer<typeof DatasetMetadataInputSchema>
export type OrderTrendsInput = z.infer<typeof OrderTrendsInputSchema>
export type CategoryPerformanceInput = z.infer<typeof CategoryPerformanceInputSchema>
export type SellerPerformanceInput = z.infer<typeof SellerPerformanceInputSchema>
export type ReviewAnalysisInput = z.infer<typeof ReviewAnalysisInputSchema>
export type PaymentBreakdownInput = z.infer<typeof PaymentBreakdownInputSchema>
export type DeliveryPerformanceInput = z.infer<typeof DeliveryPerformanceInputSchema>
