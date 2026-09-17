/**
 * Shared cohort filter for delivered_reviewed_valid_delivery.
 *
 * This cohort represents the analytical population required for Q9/Q10 comparisons:
 * - Order status = 'delivered'
 * - Canonical review exists (deduplicated by latest answer timestamp)
 * - Valid delivery timestamps (purchase + actual delivery)
 * - Valid estimated delivery timestamp (for delay calculations)
 *
 * Both delivery_performance and review_analysis MUST use this identical cohort
 * to ensure matching order eligibility on both sides of multi-tool comparisons.
 *
 * Architecture.md §6: "Define matching_cohort='delivered_reviewed_valid_delivery'
 * for Q9/Q10 and enforce the identical order eligibility in both tools."
 */

export interface CohortFilterResult {
  /** SQL conditions to add to WHERE clause (already parameterized) */
  conditions: string[]
  /** SQL JOIN clause for canonical_reviews (if not already joined) */
  joinClause: string
  /** Parameters to bind */
  params: unknown[]
  /** Next available parameter index */
  nextParamIndex: number
  /** Human-readable assumptions for this cohort */
  assumptions: string[]
}

export interface CohortFilterOptions {
  /** Start parameter index for SQL binding */
  startParamIndex?: number
  /** Whether the tool already JOINs canonical_reviews (review_analysis does) */
  alreadyJoinedCanonicalReviews?: boolean
}

/**
 * Build the delivered_reviewed_valid_delivery cohort filter.
 *
 * Returns SQL conditions and JOIN clause that ensure both tools
 * select the same eligible orders for multi-tool comparisons.
 */
export function buildDeliveredReviewedValidDeliveryCohort(
  options: CohortFilterOptions = {}
): CohortFilterResult {
  const {
    startParamIndex = 1,
    alreadyJoinedCanonicalReviews = false,
  } = options

  const conditions: string[] = []
  const params: unknown[] = []
  let paramIdx = startParamIndex
  const joinParts: string[] = []
  const assumptions: string[] = []

  // 1. Order must be delivered
  conditions.push(`o.order_status = 'delivered'`)

  // 2. Valid purchase timestamp (required for all delivery calculations)
  conditions.push(`o.order_purchase_timestamp IS NOT NULL`)

  // 3. Valid actual delivery timestamp (required for delivery duration)
  conditions.push(`o.order_delivered_customer_date IS NOT NULL`)

  // 4. Valid estimated delivery timestamp (required for delay/on-time calculations)
  conditions.push(`o.order_estimated_delivery_date IS NOT NULL`)

  // 5. Canonical review must exist (one per order, deduplicated by latest answer)
  if (!alreadyJoinedCanonicalReviews) {
    joinParts.push(`JOIN analytics.canonical_reviews cr ON o.order_id = cr.order_id`)
  }

  assumptions.push(
    'Cohort: delivered_reviewed_valid_delivery',
    'Orders must have: delivered status, valid purchase/delivery/estimated timestamps, and a canonical review',
    'Canonical reviews are deduplicated by latest answer timestamp (one per order)',
  )

  return {
    conditions,
    joinClause: joinParts.join(' '),
    params,
    nextParamIndex: paramIdx,
    assumptions,
  }
}

/**
 * Build cohort metadata for tool response.
 * Returns the cohort identifier and assumptions for inclusion in tool output.
 */
export function getCohortMetadata(): { cohort: string; assumptions: string[] } {
  return {
    cohort: 'delivered_reviewed_valid_delivery',
    assumptions: [
      'Cohort: delivered_reviewed_valid_delivery',
      'Eligible orders: delivered status, valid timestamps, canonical review exists',
    ],
  }
}
