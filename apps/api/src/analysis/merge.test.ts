import { describe, it, expect } from 'vitest'
import { keyedMerge, MergeError } from './merge.js'

const recipe = {
  strategy: 'keyed' as const,
  leftNode: 'left',
  rightNode: 'right',
  leftKey: 'key',
  rightKey: 'key',
  on: 'test',
}

describe('keyedMerge', () => {
  it('merges by key, never by array position', () => {
    const merged = keyedMerge(
      [{ key: 'b', v: 2 }, { key: 'a', v: 1 }],
      [{ key: 'a', w: 10 }, { key: 'b', w: 20 }],
      recipe
    )
    expect(merged.rows).toHaveLength(2)
    const a = merged.rows.find((r) => r.key === 'a')!
    expect(a.right!['w']).toBe(10)
    const b = merged.rows.find((r) => r.key === 'b')!
    expect(b.right!['w']).toBe(20)
  })

  it('keeps left-only rows with a warning', () => {
    const merged = keyedMerge(
      [{ key: 'a', v: 1 }, { key: 'b', v: 2 }],
      [{ key: 'a', w: 10 }],
      recipe
    )
    expect(merged.rows.find((r) => r.key === 'b')!.right).toBeNull()
    expect(merged.warnings.some((w) => w.includes('left-only'))).toBe(true)
  })

  it('drops right-only rows with a warning', () => {
    const merged = keyedMerge(
      [{ key: 'a', v: 1 }],
      [{ key: 'a', w: 10 }, { key: 'z', w: 99 }],
      recipe
    )
    expect(merged.rows).toHaveLength(1)
    expect(merged.warnings.some((w) => w.includes('right-only'))).toBe(true)
  })

  it('throws on duplicate keys instead of silently joining by position', () => {
    expect(() => keyedMerge([{ key: 'a', v: 1 }, { key: 'a', v: 2 }], [{ key: 'a', w: 10 }], recipe)).toThrow(MergeError)
  })

  it('drops null-key rows with a warning', () => {
    const merged = keyedMerge(
      [{ key: 'a', v: 1 }, { key: null, v: 2 }],
      [{ key: 'a', w: 10 }],
      recipe
    )
    expect(merged.rows).toHaveLength(1)
    expect(merged.warnings.some((w) => w.includes('null'))).toBe(true)
  })

  it('handles an empty right side (empty side)', () => {
    const merged = keyedMerge([{ key: 'a', v: 1 }], [], recipe)
    expect(merged.rows).toHaveLength(1)
    expect(merged.rows[0]!.right).toBeNull()
  })

  it('joins on bound category keys from fan-out results', () => {
    const merged = keyedMerge(
      [{ category_english: 'alpha', metric_value: 10 }],
      [{ category: 'alpha', metric_value: 4.5 }],
      { strategy: 'keyed', leftNode: 'rank', rightNode: 'reviews', leftKey: 'category_english', rightKey: 'category', on: 'category' }
    )
    expect(merged.rows[0]!.right!['metric_value']).toBe(4.5)
  })
})
