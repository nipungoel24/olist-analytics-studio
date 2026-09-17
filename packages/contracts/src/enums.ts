export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export type BrazilianState = (typeof BRAZILIAN_STATES)[number]

export const GRANULARITIES = ['day', 'week', 'month', 'quarter', 'year'] as const
export type Granularity = (typeof GRANULARITIES)[number]

export const SORT_ORDERS = ['asc', 'desc'] as const
export type SortOrder = (typeof SORT_ORDERS)[number]

export const ORDER_TRENDS_METRICS = [
  'revenue',
  'order_count',
  'average_delivery_days',
  'on_time_rate',
] as const
export type OrderTrendsMetric = (typeof ORDER_TRENDS_METRICS)[number]

export const CATEGORY_PERFORMANCE_METRICS = [
  'revenue',
  'order_count',
  'average_review_score',
  'total_freight',
  'item_count',
] as const
export type CategoryPerformanceMetric = (typeof CATEGORY_PERFORMANCE_METRICS)[number]

export const SELLER_PERFORMANCE_METRICS = [
  'revenue',
  'order_count',
  'average_review_score',
  'average_delivery_days',
] as const
export type SellerPerformanceMetric = (typeof SELLER_PERFORMANCE_METRICS)[number]

export const REVIEW_ANALYSIS_METRICS = [
  'score_distribution',
  'average_score',
  'review_count',
  'average_response_days',
] as const
export type ReviewAnalysisMetric = (typeof REVIEW_ANALYSIS_METRICS)[number]

export const PAYMENT_BREAKDOWN_METRICS = [
  'payment_value',
  'payment_count',
  'order_count',
  'average_installments',
] as const
export type PaymentBreakdownMetric = (typeof PAYMENT_BREAKDOWN_METRICS)[number]

export const DELIVERY_PERFORMANCE_METRICS = [
  'average_delivery_days',
  'average_delay_days',
  'on_time_rate',
  'order_count',
] as const
export type DeliveryPerformanceMetric = (typeof DELIVERY_PERFORMANCE_METRICS)[number]

export const ORDER_STATUSES = [
  'delivered',
  'shipped',
  'processing',
  'invoiced',
  'canceled',
  'unavailable',
  'approved',
  'created',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_TYPES = [
  'credit_card',
  'boleto',
  'voucher',
  'debit_card',
] as const
export type PaymentType = (typeof PAYMENT_TYPES)[number]
