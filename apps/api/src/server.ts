import { Client as PgClient } from 'pg'
import { Client as McpClient } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { loadConfig } from './config.js'
import { createAppDb } from './db/pool.js'
import { createMcpAdapter, type ToolCallAdapter } from './mcp/adapter.js'
import { createAnthropicAdapter } from './mcp/provider-adapter.js'
import type { ProviderAdapter } from './mcp/provider-adapter.js'
import { createAgent } from './agents/factory.js'
import { buildApp } from './app.js'

const config = loadConfig()
for (const warning of config.warnings) {
  process.stderr.write(`[api] config warning: ${warning}\n`)
}

let dbReady = false
let mcpReady = false
let mcpClient: McpClient | null = null
let mcpRetries = 0
const MAX_MCP_RETRIES = 3

function log(msg: string) {
  process.stderr.write(`[api] ${msg}\n`)
}

const appDb = createAppDb(config.databaseUrl)

async function checkDatabase(): Promise<boolean> {
  const client = new PgClient({ connectionString: config.databaseUrl })
  try {
    await client.connect()
    const result = await client.query('SELECT 1')
    await client.end()
    return result.rows.length > 0
  } catch {
    return false
  }
}

async function startMcpChild(): Promise<void> {
  if (mcpClient) return

  log('Starting MCP child process')
  try {
    const childEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) childEnv[key] = value
    }
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['../mcp/dist/server.js'],
      // SDK v2 inherits only a safe allowlist of env vars by default;
      // the MCP child needs DATABASE_URL (and TOOL_TIMEOUT_MS) explicitly.
      env: childEnv,
    })

    mcpClient = new McpClient({ name: 'olist-api', version: '0.1.0' }, { capabilities: {} })
    await mcpClient.connect(transport)

    const tools = await mcpClient.listTools()
    const toolNames = tools.tools.map((t) => t.name)
    log(`MCP child ready, tools: ${toolNames.join(', ')}`)
    mcpReady = true
    mcpRetries = 0
  } catch (err) {
    log(`MCP child failed to start: ${err}`)
    mcpClient = null
    mcpReady = false
    scheduleMcpRestart()
  }
}

function scheduleMcpRestart(): void {
  if (mcpRetries >= MAX_MCP_RETRIES) {
    log(`MCP max retries (${MAX_MCP_RETRIES}) reached`)
    return
  }
  mcpRetries++
  const delay = Math.min(1000 * Math.pow(2, mcpRetries - 1), 4000)
  log(`Scheduling MCP restart in ${delay}ms (attempt ${mcpRetries})`)
  setTimeout(() => startMcpChild(), delay)
}

// The adapter reads the MCP client lazily: the child process connects after
// agent construction, so the adapter must never capture a null client.
const adapter: ToolCallAdapter = {
  async callTool(name, args) {
    if (!mcpClient) {
      return {
        ok: false,
        tool: name,
        error: { code: 'DATA_UNAVAILABLE', message: 'MCP child process is not connected' },
      }
    }
    return createMcpAdapter(mcpClient, log).callTool(name, args)
  },
  async listTools() {
    if (!mcpClient) return []
    return createMcpAdapter(mcpClient, log).listTools()
  },
  async close() {
    if (mcpClient) await mcpClient.close().catch(() => {})
  },
}

// Create provider adapter if API key is available
let providerAdapter: ProviderAdapter | null = null
if (config.anthropicApiKey) {
  providerAdapter = createAnthropicAdapter({
    apiKey: config.anthropicApiKey,
    model: config.llmModel,
  })
  log(`Provider adapter created for model ${config.llmModel}`)
} else if (config.agentMode === 'llm') {
  log('AGENT_MODE=llm but ANTHROPIC_API_KEY is not set; will auto-fallback to deterministic agent')
}

const agent = createAgent({
  adapter,
  fallbackTimeoutMs: config.fallbackTimeoutMs,
  toolTimeoutMs: config.toolTimeoutMs,
  maxRequestLength: config.maxRequestLength,
  agentMode: config.agentMode,
  anthropicApiKey: config.anthropicApiKey,
  llmModel: config.llmModel,
  modelTimeoutMs: config.modelTimeoutMs,
  maxModelTurns: config.maxModelTurns,
  maxToolCalls: config.maxToolCalls,
  providerAdapter,
  logger: log,
})

const app = buildApp({
  agent,
  db: appDb,
  adapter,
  maxRequestLength: config.maxRequestLength,
  persistResults: true,
  logger: log,
})

// Health: process is alive
app.get('/api/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}))

// Ready: database + data version + MCP
app.get('/api/ready', async () => {
  dbReady = await checkDatabase()
  const dataVersion = await appDb.getActiveDataVersion()

  const ready = dbReady && dataVersion !== null && mcpReady

  return {
    status: ready ? 'ready' : 'not_ready',
    database: dbReady,
    dataVersion,
    mcpReady,
    mcpRetries,
  }
})

async function start(): Promise<void> {
  dbReady = await checkDatabase()
  if (!dbReady) {
    log('Database not ready, will retry on startup')
  }

  await startMcpChild()

  await app.listen({ port: config.port, host: '0.0.0.0' })
  log(`API server listening on port ${config.port}`)
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  log('Received SIGTERM, shutting down')
  if (mcpClient) {
    await mcpClient.close().catch(() => {})
  }
  await appDb.close()
  await app.close()
  process.exit(0)
})

start().catch((err) => {
  process.stderr.write(`[api] startup failed: ${err}\n`)
  process.exit(1)
})
