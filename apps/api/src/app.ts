import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'path'
import { fileURLToPath } from 'url'
import type { ILLMAgent } from './agents/interface.js'
import type { AppDb } from './db/pool.js'
import type { ToolCallAdapter } from './mcp/adapter.js'
import { registerAnalysesRoutes } from './routes/analyses.js'
import { registerPinsRoutes } from './routes/pins.js'

// Application builder: routes depend only on the ILLMAgent interface and the
// app-schema database handle. Tests inject fakes here.

export interface BuildAppDeps {
  agent: ILLMAgent
  db: AppDb | null
  adapter?: ToolCallAdapter | null
  maxRequestLength: number
  persistResults?: boolean
  requestIdFactory?: () => string
  logger?: (msg: string) => void
}

export function buildApp(deps: BuildAppDeps): FastifyInstance {
  const app = Fastify({ logger: false })

  const requestIdFactory = deps.requestIdFactory ?? (() => crypto.randomUUID())

  registerAnalysesRoutes(app, {
    agent: deps.agent,
    db: deps.db,
    maxRequestLength: deps.maxRequestLength,
    requestIdFactory,
    persistResults: deps.persistResults ?? false,
    logger: deps.logger,
  })

  // Register pin routes if adapter is provided
  if (deps.adapter && deps.db) {
    registerPinsRoutes(app, {
      db: deps.db,
      adapter: deps.adapter,
      maxRequestLength: deps.maxRequestLength,
      requestIdFactory,
      logger: deps.logger,
    })
  }

  // Serve web app static files (SPA fallback)
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const webDistPath = path.resolve(__dirname, '../../web/dist')
  app.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    wildcard: false,
  })
  // SPA fallback: serve index.html for non-API, non-file routes
  app.setNotFoundHandler((request, reply) => {
    if (!request.url.startsWith('/api/')) {
      return reply.sendFile('index.html')
    }
    reply.code(404).send({ error: 'Not Found' })
  })

  return app
}
