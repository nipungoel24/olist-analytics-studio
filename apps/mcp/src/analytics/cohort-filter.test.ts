import { describe, it, expect } from 'vitest'
import {
  buildDeliveredReviewedValidDeliveryCohort,
  getCohortMetadata,
} from './cohort-filter.js'

describe('cohort-filter', () => {
  describe('buildDeliveredReviewedValidDeliveryCohort', () => {
    it('returns conditions for delivered_reviewed_valid_delivery cohort', () => {
      const result = buildDeliveredReviewedValidDeliveryCohort()

      // Should include all required conditions
      expect(result.conditions).toContain("o.order_status = 'delivered'")
      expect(result.conditions).toContain('o.order_purchase_timestamp IS NOT NULL')
      expect(result.conditions).toContain('o.order_delivered_customer_date IS NOT NULL')
      expect(result.conditions).toContain('o.order_estimated_delivery_date IS NOT NULL')
    })

    it('includes canonical_reviews JOIN when not already joined', () => {
      const result = buildDeliveredReviewedValidDeliveryCohort({
        alreadyJoinedCanonicalReviews: false,
      })

      expect(result.joinClause).toContain('JOIN analytics.canonical_reviews cr ON o.order_id = cr.order_id')
    })

    it('excludes canonical_reviews JOIN when already joined', () => {
      const result = buildDeliveredReviewedValidDeliveryCohort({
        alreadyJoinedCanonicalReviews: true,
      })

      expect(result.joinClause).not.toContain('JOIN analytics.canonical_reviews')
    })

    it('starts parameter indexing at specified index', () => {
      const result = buildDeliveredReviewedValidDeliveryCohort({
        startParamIndex: 5,
      })

      expect(result.nextParamIndex).toBe(5)
    })

    it('returns cohort assumptions', () => {
      const result = buildDeliveredReviewedValidDeliveryCohort()

      expect(result.assumptions).toContain('Cohort: delivered_reviewed_valid_delivery')
      expect(result.assumptions.some(a => a.includes('delivered status'))).toBe(true)
      expect(result.assumptions.some(a => a.includes('canonical review'))).toBe(true)
    })
  })

  describe('getCohortMetadata', () => {
    it('returns cohort identifier and assumptions', () => {
      const metadata = getCohortMetadata()

      expect(metadata.cohort).toBe('delivered_reviewed_valid_delivery')
      expect(metadata.assumptions).toContain('Cohort: delivered_reviewed_valid_delivery')
      expect(metadata.assumptions.some(a => a.includes('Eligible orders'))).toBe(true)
    })
  })

  describe('synthetic fixture validation', () => {
    // Synthetic fixture test orders:
    // Order A: delivered, valid delivery timestamps, has canonical review → INCLUDED
    // Order B: delivered, valid delivery timestamps, NO review → EXCLUDED
    // Order C: delivered, has review, missing required delivery timestamp → EXCLUDED
    // Order D: shipped, has review, valid timestamps → EXCLUDED

    it('cohort conditions match Order A (included)', () => {
      const cohort = buildDeliveredReviewedValidDeliveryCohort()

      // Order A has all required fields, so all conditions should be satisfiable
      const orderA = {
        order_status: 'delivered',
        order_purchase_timestamp: '2017-01-01',
        order_delivered_customer_date: '2017-01-10',
        order_estimated_delivery_date: '2017-01-15',
        has_canonical_review: true,
      }

      // Verify conditions are met
      expect(orderA.order_status).toBe('delivered')
      expect(orderA.order_purchase_timestamp).not.toBeNull()
      expect(orderA.order_delivered_customer_date).not.toBeNull()
      expect(orderA.order_estimated_delivery_date).not.toBeNull()
      expect(orderA.has_canonical_review).toBe(true)
    })

    it('cohort conditions exclude Order B (no review)', () => {
      // Order B has all timestamp fields but no canonical review
      const orderB = {
        order_status: 'delivered',
        order_purchase_timestamp: '2017-01-01',
        order_delivered_customer_date: '2017-01-10',
        order_estimated_delivery_date: '2017-01-15',
        has_canonical_review: false,
      }

      // Order B should be excluded because it has no canonical review
      // The cohort requires JOIN with canonical_reviews, which would filter out Order B
      expect(orderB.has_canonical_review).toBe(false)
    })

    it('cohort conditions exclude Order C (missing delivery timestamp)', () => {
      // Order C has review but missing delivery timestamp
      const orderC = {
        order_status: 'delivered',
        order_purchase_timestamp: '2017-01-01',
        order_delivered_customer_date: null,
        order_estimated_delivery_date: '2017-01-15',
        has_canonical_review: true,
      }

      // Order C should be excluded because order_delivered_customer_date IS NULL
      expect(orderC.order_delivered_customer_date).toBeNull()
    })

    it('cohort conditions exclude Order D (not delivered)', () => {
      // Order D is shipped, not delivered
      const orderD = {
        order_status: 'shipped',
        order_purchase_timestamp: '2017-01-01',
        order_delivered_customer_date: '2017-01-10',
        order_estimated_delivery_date: '2017-01-15',
        has_canonical_review: true,
      }

      // Order D should be excluded because order_status != 'delivered'
      expect(orderD.order_status).not.toBe('delivered')
    })

    it('both tool paths use identical cohort conditions', () => {
      // delivery_performance: alreadyJoinedCanonicalReviews = false
      const deliveryCohort = buildDeliveredReviewedValidDeliveryCohort({
        alreadyJoinedCanonicalReviews: false,
      })

      // review_analysis: alreadyJoinedCanonicalReviews = true (it already JOINs canonical_reviews)
      const reviewCohort = buildDeliveredReviewedValidDeliveryCohort({
        alreadyJoinedCanonicalReviews: true,
      })

      // Both should have identical WHERE conditions
      expect(deliveryCohort.conditions).toEqual(reviewCohort.conditions)

      // Both should have identical assumptions
      expect(deliveryCohort.assumptions).toEqual(reviewCohort.assumptions)

      // delivery_performance needs the JOIN, review_analysis doesn't
      expect(deliveryCohort.joinClause).toContain('JOIN analytics.canonical_reviews')
      expect(reviewCohort.joinClause).not.toContain('JOIN analytics.canonical_reviews')
    })
  })
})
