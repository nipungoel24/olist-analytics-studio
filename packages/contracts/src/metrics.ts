export const METRICS = {
  revenue: {
    name: 'Revenue',
    formula: 'SUM(order_items.price)',
    unit: 'BRL',
    description: 'Delivered merchandise revenue in BRL, excluding freight. SUM(item.price) on delivered orders by purchase date.',
  },
  order_count: {
    name: 'Order Count',
    formula: 'COUNT(DISTINCT order_id)',
    unit: 'count',
    description: 'Distinct order count. All statuses by default.',
  },
  item_count: {
    name: 'Item Count',
    formula: 'COUNT(*)',
    unit: 'count',
    description: 'Total item rows.',
  },
  total_freight: {
    name: 'Total Freight',
    formula: 'SUM(order_items.freight_value)',
    unit: 'BRL',
    description: 'Total freight value in BRL.',
  },
  average_review_score: {
    name: 'Average Review Score',
    formula: 'AVG(canonical_reviews.review_score)',
    unit: 'stars',
    description: 'Average review score using canonical reviews (one per order, deduplicated by latest answer timestamp).',
  },
  average_delivery_days: {
    name: 'Average Delivery Days',
    formula: 'AVG(order_delivered_customer_date - order_purchase_timestamp)',
    unit: 'days',
    description: 'Average delivery duration in days for delivered orders with valid timestamps.',
  },
  average_delay_days: {
    name: 'Average Delay Days',
    formula: 'AVG(order_delivered_customer_date - order_estimated_delivery_date)',
    unit: 'days',
    description: 'Average delivery delay in days. Positive means late. Only for delivered orders with valid timestamps.',
  },
  on_time_rate: {
    name: 'On-Time Rate',
    formula: 'COUNT(CASE WHEN actual <= estimated) / COUNT(*)',
    unit: 'percent',
    description: 'Percentage of delivered orders where actual delivery date <= estimated delivery date.',
  },
  payment_value: {
    name: 'Payment Value',
    formula: 'SUM(order_payments.payment_value)',
    unit: 'BRL',
    description: 'Total payment value in BRL.',
  },
  payment_count: {
    name: 'Payment Count',
    formula: 'COUNT(*)',
    unit: 'count',
    description: 'Number of payment lines.',
  },
  average_installments: {
    name: 'Average Installments',
    formula: 'AVG(payment_installments)',
    unit: 'count',
    description: 'Average number of payment installments.',
  },
  review_count: {
    name: 'Review Count',
    formula: 'COUNT(*)',
    unit: 'count',
    description: 'Number of canonical reviews.',
  },
  average_response_days: {
    name: 'Average Response Days',
    formula: 'AVG(review_answer_timestamp - review_creation_date)',
    unit: 'days',
    description: 'Average survey response interval in days. Only valid nonnegative intervals.',
  },
  payment_share: {
    name: 'Payment Share',
    formula: 'SUM(value) / SUM(SUM(value)) OVER ()',
    unit: 'percent',
    description: 'Share of total payment value by payment type.',
  },
} as const

export type MetricKey = keyof typeof METRICS
