export interface AppConfig {
  databaseUrl: string
  port: number
  agentMode: string
  anthropicApiKey: string | null
  llmModel: string
  analysisTimeoutMs: number
  modelTimeoutMs: number
  fallbackTimeoutMs: number
  toolTimeoutMs: number
  maxRequestLength: number
  maxModelTurns: number
  maxToolCalls: number
  warnings: string[]
}

export interface IntBounds {
  min: number
  max: number
}

// Hardened positive-integer configuration parsing. Invalid configuration
// deterministically falls back to the default (Rules.md failure handling).
export function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  bounds: IntBounds,
  name: string,
  warnings: string[]
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    warnings.push(`Invalid ${name} "${raw}"; using default ${fallback}`)
    return fallback
  }
  return parsed
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const warnings: string[] = []

  const agentMode = (env['AGENT_MODE'] ?? 'fallback').trim().toLowerCase()
  if (agentMode !== 'fallback' && agentMode !== 'llm') {
    warnings.push(`Unknown AGENT_MODE "${agentMode}"; using "fallback"`)
  }

  const apiKey = env['ANTHROPIC_API_KEY']?.trim() || null
  const llmModel = (env['LLM_MODEL'] ?? 'claude-sonnet-4-20250514').trim()

  if (agentMode === 'llm' && !apiKey) {
    warnings.push('AGENT_MODE=llm but ANTHROPIC_API_KEY is missing; will fall back to deterministic agent')
  }

  return {
    databaseUrl: env['DATABASE_URL'] ?? 'postgresql://olist:olist_dev@localhost:5432/olist',
    port: parsePositiveInt(env['PORT'], 3000, { min: 1, max: 65535 }, 'PORT', warnings),
    agentMode: agentMode === 'llm' ? 'llm' : 'fallback',
    anthropicApiKey: apiKey,
    llmModel,
    analysisTimeoutMs: parsePositiveInt(env['ANALYSIS_TIMEOUT_MS'], 45000, { min: 1000, max: 300000 }, 'ANALYSIS_TIMEOUT_MS', warnings),
    modelTimeoutMs: parsePositiveInt(env['MODEL_TIMEOUT_MS'], 25000, { min: 1000, max: 60000 }, 'MODEL_TIMEOUT_MS', warnings),
    fallbackTimeoutMs: parsePositiveInt(env['FALLBACK_TIMEOUT_MS'], 10000, { min: 1000, max: 60000 }, 'FALLBACK_TIMEOUT_MS', warnings),
    toolTimeoutMs: parsePositiveInt(env['TOOL_TIMEOUT_MS'], 5000, { min: 100, max: 60000 }, 'TOOL_TIMEOUT_MS', warnings),
    maxRequestLength: parsePositiveInt(env['MAX_REQUEST_LENGTH'], 2000, { min: 100, max: 10000 }, 'MAX_REQUEST_LENGTH', warnings),
    maxModelTurns: parsePositiveInt(env['MAX_MODEL_TURNS'], 4, { min: 1, max: 10 }, 'MAX_MODEL_TURNS', warnings),
    maxToolCalls: parsePositiveInt(env['MAX_TOOL_CALLS'], 8, { min: 1, max: 20 }, 'MAX_TOOL_CALLS', warnings),
    warnings,
  }
}
