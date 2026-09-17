import { describe, it, expect } from 'vitest'
import { loadConfig, parsePositiveInt } from './config.js'

describe('parsePositiveInt', () => {
  it('returns fallback for undefined or empty input', () => {
    const warnings: string[] = []
    expect(parsePositiveInt(undefined, 5000, { min: 100, max: 60000 }, 'TOOL_TIMEOUT_MS', warnings)).toBe(5000)
    expect(parsePositiveInt('', 5000, { min: 100, max: 60000 }, 'TOOL_TIMEOUT_MS', warnings)).toBe(5000)
    expect(warnings).toHaveLength(0)
  })

  it('rejects NaN and non-numeric values with a warning', () => {
    const warnings: string[] = []
    expect(parsePositiveInt('not-a-number', 5000, { min: 100, max: 60000 }, 'TOOL_TIMEOUT_MS', warnings)).toBe(5000)
    expect(parsePositiveInt('Infinity', 5000, { min: 100, max: 60000 }, 'TOOL_TIMEOUT_MS', warnings)).toBe(5000)
    expect(parsePositiveInt('1.5', 5000, { min: 100, max: 60000 }, 'TOOL_TIMEOUT_MS', warnings)).toBe(5000)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('rejects out-of-bounds values deterministically', () => {
    const warnings: string[] = []
    expect(parsePositiveInt('0', 5000, { min: 100, max: 60000 }, 'TOOL_TIMEOUT_MS', warnings)).toBe(5000)
    expect(parsePositiveInt('99999999', 5000, { min: 100, max: 60000 }, 'TOOL_TIMEOUT_MS', warnings)).toBe(5000)
    expect(warnings).toHaveLength(2)
  })

  it('accepts valid integers', () => {
    const warnings: string[] = []
    expect(parsePositiveInt('2500', 5000, { min: 100, max: 60000 }, 'TOOL_TIMEOUT_MS', warnings)).toBe(2500)
    expect(warnings).toHaveLength(0)
  })
})

describe('loadConfig', () => {
  it('uses defaults when no env is set', () => {
    const config = loadConfig({})
    expect(config.agentMode).toBe('fallback')
    expect(config.analysisTimeoutMs).toBe(45000)
    expect(config.fallbackTimeoutMs).toBe(10000)
    expect(config.toolTimeoutMs).toBe(5000)
    expect(config.maxRequestLength).toBe(2000)
  })

  it('falls back for invalid values with warnings', () => {
    const config = loadConfig({
      TOOL_TIMEOUT_MS: 'abc',
      ANALYSIS_TIMEOUT_MS: '999999999',
      FALLBACK_TIMEOUT_MS: '-5',
      MAX_REQUEST_LENGTH: 'NaN',
      AGENT_MODE: 'quantum',
    })
    expect(config.toolTimeoutMs).toBe(5000)
    expect(config.analysisTimeoutMs).toBe(45000)
    expect(config.fallbackTimeoutMs).toBe(10000)
    expect(config.maxRequestLength).toBe(2000)
    expect(config.agentMode).toBe('fallback')
    expect(config.warnings.length).toBeGreaterThan(0)
  })

  it('accepts valid overrides', () => {
    const config = loadConfig({ TOOL_TIMEOUT_MS: '2500', MAX_REQUEST_LENGTH: '3000' })
    expect(config.toolTimeoutMs).toBe(2500)
    expect(config.maxRequestLength).toBe(3000)
  })
})
