import type { FastifyInstance } from 'fastify'
import type { AppDb } from '../db/pool.js'
import type { ToolCallAdapter } from '../mcp/adapter.js'
import { CreatePinRequestSchema, isPinnable, isValidChartOption } from '@olist/contracts'
import { refreshPin } from '../analysis/refresh.js'

// Pin routes for Phase 5 persistence.
// Server trust boundary: browser cannot provide analytical truth.

export interface PinsRouteDeps {
  db: AppDb
  adapter: ToolCallAdapter
  maxRequestLength: number
  requestIdFactory: () => string
  logger?: (msg: string) => void
}

export function registerPinsRoutes(app: FastifyInstance, deps: PinsRouteDeps): void {
  const { db, adapter, logger } = deps

  // POST /api/pins - Create a pin from an existing analysis
  app.post('/api/pins', async (request, reply) => {
    const bodyParse = CreatePinRequestSchema.safeParse(request.body)
    if (!bodyParse.success) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        message: 'Request body must be a valid pin creation request.',
        details: bodyParse.error.issues,
      })
    }

    const { analysisId, chartOptionId, title } = bodyParse.data

    // Load analysis
    const analysis = await db.getAnalysis(analysisId)
    if (!analysis) {
      return reply.code(404).send({
        error: 'NOT_FOUND',
        message: 'Analysis not found.',
      })
    }

    // Check pin eligibility (Architecture.md §8)
    // Query snapshots for this analysis
    const snapshots = await db.getSnapshotsForAnalysis(analysisId)
    if (snapshots.length === 0) {
      return reply.code(400).send({
        error: 'NOT_PINNABLE',
        message: 'Analysis has no successful snapshots to pin.',
      })
    }

    // Get the latest snapshot for this analysis
    const latestSnapshot = snapshots[0] // Already sorted by created_at DESC
    if (!latestSnapshot) {
      return reply.code(400).send({
        error: 'NOT_PINNABLE',
        message: 'No snapshot available for this analysis.',
      })
    }

    // Check if snapshot is pinnable
    if (!isPinnable(latestSnapshot.status)) {
      return reply.code(400).send({
        error: 'NOT_PINNABLE',
        message: `Analysis status '${latestSnapshot.status}' is not pinnable.`,
      })
    }

    // Validate chart option if provided
    if (chartOptionId !== undefined) {
      const chartOptions = latestSnapshot.chartOptions as unknown[]
      if (!isValidChartOption(chartOptions, chartOptionId)) {
        return reply.code(400).send({
          error: 'INVALID_CHART_OPTION',
          message: 'Chart option ID is invalid or belongs to another result.',
        })
      }
    }

    // Check for duplicate pin (same analysis + chart option)
    const existingPin = await db.getPinByAnalysisAndChart(
      analysisId,
      chartOptionId ?? 0
    )
    if (existingPin) {
      // Idempotent response - return existing pin
      return reply.code(200).send({
        pinId: existingPin.pinId,
        analysisId: existingPin.analysisId,
        latestSnapshotId: existingPin.latestSnapshotId,
        chosenChartOption: existingPin.chosenChartOption,
        planVersion: existingPin.planVersion,
        title: existingPin.title,
        createdAt: existingPin.createdAt,
        updatedAt: existingPin.updatedAt,
      })
    }

    // Create pin
    try {
      const pin = await db.insertPin(
        analysisId,
        latestSnapshot.snapshotId,
        chartOptionId ?? 0,
        title ?? null
      )

      return reply.code(201).send(pin)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (logger) logger(`[pins] Failed to create pin: ${msg}`)
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to create pin.',
      })
    }
  })

  // GET /api/pins - List all pins
  app.get('/api/pins', async (_request, reply) => {
    try {
      const pins = await db.getPins()
      return reply.code(200).send(pins)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (logger) logger(`[pins] Failed to list pins: ${msg}`)
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to list pins.',
      })
    }
  })

  // DELETE /api/pins/:id - Delete a pin
  app.delete('/api/pins/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        message: 'Invalid pin ID format.',
      })
    }

    try {
      const deleted = await db.deletePin(id)
      if (!deleted) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Pin not found.',
        })
      }

      return reply.code(200).send({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (logger) logger(`[pins] Failed to delete pin: ${msg}`)
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete pin.',
      })
    }
  })

  // POST /api/pins/:id/refresh - Refresh a pin
  app.post('/api/pins/:id/refresh', async (request, reply) => {
    const { id } = request.params as { id: string }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        message: 'Invalid pin ID format.',
      })
    }

    const requestId = deps.requestIdFactory()
    if (logger) logger(`[pins] Refresh request ${requestId} for pin ${id}`)

    try {
      const controller = new AbortController()
      const onAborted = () => controller.abort()
      request.raw.once('aborted', onAborted)

      const result = await refreshPin(
        id,
        {
          db,
          adapter,
          overallDeadlineMs: 45000,
          toolTimeoutMs: 5000,
          logger,
        },
        controller.signal
      )

      request.raw.removeListener('aborted', onAborted)

      if (!result.success && result.status !== 'partial') {
        return reply.code(400).send({
          error: 'REFRESH_FAILED',
          message: result.error ?? 'Refresh failed.',
          refreshId: result.refreshId,
          status: result.status,
        })
      }

      // Success or partial (partial is not a failure)
      return reply.code(200).send({
        refreshId: result.refreshId,
        status: result.status,
        diff: result.diff,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (logger) logger(`[pins] Refresh error: ${msg}`)
      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Refresh failed unexpectedly.',
      })
    }
  })
}
