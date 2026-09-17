import { describe, it, expect } from 'vitest'
import { parseTimeoutMs } from './timeout-config.js'

describe('parseTimeoutMs', () => {
  it('returns fallback for undefined, empty and invalid input', () => {
    expect(parseTimeoutMs(undefined, 5000)).toBe(5000)
    expect(parseTimeoutMs('', 5000)).toBe(5000)
    expect(parseTimeoutMs('abc', 5000)).toBe(5000)
    expect(parseTimeoutMs('NaN', 5000)).toBe(5000)
    expect(parseTimeoutMs('Infinity', 5000)).toBe(5000)
    expect(parseTimeoutMs('1.5', 5000)).toBe(5000)
  })

  it('clamps out-of-bounds values to fallback', () => {
    expect(parseTimeoutMs('0', 5000)).toBe(5000)
    expect(parseTimeoutMs('-10', 5000)).toBe(5000)
    expect(parseTimeoutMs('99999999', 5000)).toBe(5000)
  })

  it('accepts valid bounded integers', () => {
    expect(parseTimeoutMs('2500', 5000)).toBe(2500)
    expect(parseTimeoutMs('60000', 5000)).toBe(60000)
  })

  it('never returns NaN or Infinity', () => {
    for (const raw of ['abc', 'NaN', 'Infinity', '1.5', '0', '-1', '999999999']) {
      const result = parseTimeoutMs(raw, 5000)
      expect(Number.isFinite(result)).toBe(true)
      expect(Number.isInteger(result)).toBe(true)
    }
  })
})
