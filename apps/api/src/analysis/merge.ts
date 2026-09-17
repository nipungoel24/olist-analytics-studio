import type { MergeRecipe } from '@olist/contracts'

// Keyed multi-tool composition (Architecture.md §6, Phases.md Phase 3.4).
// Rows are joined by explicit keys, never by array position. Data-version
// equality across sources is enforced by the executor, not here.

export interface MergedRow {
  key: string
  left: Record<string, unknown> | null
  right: Record<string, unknown> | null
}

export interface MergeResult {
  rows: MergedRow[]
  warnings: string[]
}

export class MergeError extends Error {}

export function keyedMerge(
  leftRows: Array<Record<string, unknown>>,
  rightRows: Array<Record<string, unknown>>,
  recipe: MergeRecipe
): MergeResult {
  const warnings: string[] = []

  const leftMap = new Map<string, Record<string, unknown>>()
  const leftDupes: string[] = []
  for (const row of leftRows) {
    const key = row[recipe.leftKey]
    if (key === undefined || key === null) {
      warnings.push(`dropped ${recipe.leftNode} row with null/undefined key "${recipe.leftKey}"`)
      continue
    }
    const keyStr = String(key)
    if (leftMap.has(keyStr)) {
      leftDupes.push(keyStr)
    }
    leftMap.set(keyStr, row)
  }
  if (leftDupes.length > 0) {
    throw new MergeError(`duplicate keys on left side (${recipe.leftNode}.${recipe.leftKey}): ${leftDupes.slice(0, 5).join(', ')}`)
  }

  const rightMap = new Map<string, Record<string, unknown>>()
  const rightDupes: string[] = []
  for (const row of rightRows) {
    const key = row[recipe.rightKey]
    if (key === undefined || key === null) {
      warnings.push(`dropped ${recipe.rightNode} row with null/undefined key "${recipe.rightKey}"`)
      continue
    }
    const keyStr = String(key)
    if (rightMap.has(keyStr)) {
      rightDupes.push(keyStr)
    }
    rightMap.set(keyStr, row)
  }
  if (rightDupes.length > 0) {
    throw new MergeError(`duplicate keys on right side (${recipe.rightNode}.${recipe.rightKey}): ${rightDupes.slice(0, 5).join(', ')}`)
  }

  const rows: MergedRow[] = []
  for (const [key, leftRow] of leftMap) {
    const rightRow = rightMap.get(key) ?? null
    if (!rightRow) {
      warnings.push(`no ${recipe.rightNode} row matched key "${key}" (left-only row kept)`)
    }
    rows.push({ key, left: leftRow, right: rightRow })
  }
  const rightOnlyKeys = [...rightMap.keys()].filter((k) => !leftMap.has(k))
  for (const key of rightOnlyKeys) {
    warnings.push(`${recipe.rightNode} row with key "${key}" has no matching ${recipe.leftNode} row (right-only row dropped)`)
  }

  return { rows, warnings }
}
