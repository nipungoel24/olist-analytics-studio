import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ILLMAgent } from '../agents/interface.js'
import type { AppDb } from '../db/pool.js'
import type { ExecutablePlan, AgentResult } from '@olist/contracts'

// POST /api/analyses (Architecture.md §8): validated question -> AgentResult.
// Domain outcomes (success/partial/empty/unsupported) are HTTP 200; only
// infrastructure failures map to 5xx.

const AnalysesBodySchema = z.object({
  question: z.string(),
})

export interface AnalysesRouteDeps {
  agent: ILLMAgent
  db: AppDb | null
  maxRequestLength: number
  requestIdFactory: () => string
  persistResults: boolean
  logger?: (msg: string) => void
}

export function registerAnalysesRoutes(app: FastifyInstance, deps: AnalysesRouteDeps): void {
  app.post('/api/analyses', async (request, reply) => {
    const bodyParse = AnalysesBodySchema.safeParse(request.body)
    if (!bodyParse.success) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        message: 'Request body must be a JSON object with a string field "question".',
      })
    }

    const question = bodyParse.data.question
    if (question.trim().length === 0) {
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        message: 'Question must not be empty.',
      })
    }
    if (question.length > deps.maxRequestLength) {
      return reply.code(400).send({
        error: 'REQUEST_TOO_LONG',
        message: `Question exceeds the maximum length of ${deps.maxRequestLength} characters.`,
      })
    }

    const requestId = deps.requestIdFactory()

    const controller = new AbortController()
    const onAborted = () => controller.abort()
    request.raw.once('aborted', onAborted)

    let result: AgentResult
    try {
      result = await deps.agent.run({ question, requestId, signal: controller.signal })
    } catch (err) {
      if (deps.logger) deps.logger(`[analyses] ${requestId} agent threw: ${String(err)}`)
      return reply.code(500).send({
        status: 'error',
        originalQuestion: question,
        actualMode: deps.agent.mode,
        resolvedFilters: {},
        assumptions: [],
        normalizedData: null,
        chartOptions: [],
        chartType: null,
        chartReason: null,
        insight: null,
        warnings: [],
        sources: [],
        dataVersion: null,
        executablePlan: null,
        message: 'The analysis failed unexpectedly.',
        errorCode: 'INTERNAL_ERROR',
      })
    } finally {
      request.raw.removeListener('aborted', onAborted)
    }

    // Minimal Phase 3 persistence (Architecture.md §8 requires analysis_id).
    if (deps.persistResults && deps.db && result.executablePlan) {
      try {
        const analysisId = await deps.db.insertAnalysis(
          result.originalQuestion,
          result.executablePlan as ExecutablePlan,
          result.actualMode
        )
        await deps.db.insertSnapshot(analysisId, {
          dataVersion: result.dataVersion,
          resolvedFilters: result.resolvedFilters,
          assumptions: result.assumptions,
          dataSnapshot: {
            normalizedData: result.normalizedData,
            insight: result.insight,
            chartType: result.chartType,
          },
          chartOptions: result.chartOptions,
          insight: result.insight,
          warnings: result.warnings,
          status: result.status === 'needs_clarification' ? 'error' : result.status,
        })
        result = { ...result, analysisId }
      } catch (err) {
        if (deps.logger) deps.logger(`[analyses] ${requestId} snapshot persistence failed: ${String(err)}`)
        result = {
          ...result,
          warnings: [...result.warnings, 'Analysis completed but snapshot persistence failed.'],
        }
      }
    }

    if (result.status === 'error' && result.errorCode === 'MODE_NOT_IMPLEMENTED') {
      return reply.code(501).send(result)
    }
    if (result.status === 'error') {
      return reply.code(500).send(result)
    }
    return reply.code(200).send(result)
  })
}
