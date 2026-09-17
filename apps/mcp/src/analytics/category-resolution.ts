import { runQuery } from '../db/query-runner.js'

export interface CategoryResolution {
  portuguese: string | null
  english: string
}

export interface CategoryFilterResult {
  condition: string
  params: unknown[]
  nextParamIndex: number
  assumptions: string[]
}

export interface CategoryFilterError {
  error: true
  code: 'UNKNOWN_CATEGORY'
  message: string
}

const categoryCache = new Map<string, CategoryResolution>()

export async function resolveCategory(input: string): Promise<CategoryResolution | null> {
  const normalized = input.toLowerCase().trim()

  if (categoryCache.has(normalized)) {
    return categoryCache.get(normalized)!
  }

  // Try direct match on English name
  const engResult = await runQuery<{ product_category_name: string | null; product_category_name_english: string }>(
    `SELECT product_category_name, product_category_name_english
     FROM raw.product_category_name_translation
     WHERE LOWER(product_category_name_english) = $1`,
    [normalized],
    'category_resolution'
  )

  if (!('code' in engResult) && engResult.rows.length > 0) {
    const row = engResult.rows[0]!
    const resolution = { portuguese: row.product_category_name, english: row.product_category_name_english }
    categoryCache.set(normalized, resolution)
    return resolution
  }

  // Try direct match on Portuguese name
  const ptResult = await runQuery<{ product_category_name: string; product_category_name_english: string | null }>(
    `SELECT product_category_name, product_category_name_english
     FROM raw.product_category_name_translation
     WHERE LOWER(product_category_name) = $1`,
    [normalized],
    'category_resolution'
  )

  if (!('code' in ptResult) && ptResult.rows.length > 0) {
    const row = ptResult.rows[0]!
    const resolution = {
      portuguese: row.product_category_name,
      english: row.product_category_name_english ?? 'Untranslated category',
    }
    categoryCache.set(normalized, resolution)
    return resolution
  }

  return null
}

export async function getCategoryFilter(
  categoryInput: string | undefined,
  startParamIndex: number
): Promise<CategoryFilterResult | CategoryFilterError | null> {
  if (!categoryInput) return null

  const resolution = await resolveCategory(categoryInput)
  if (!resolution) {
    return {
      error: true,
      code: 'UNKNOWN_CATEGORY',
      message: `Unknown category: "${categoryInput}". Use dataset_metadata to list available categories.`,
    }
  }

  const assumptions: string[] = []
  if (resolution.english === 'Untranslated category') {
    assumptions.push(`Category "${categoryInput}" resolved to untranslated category`)
  }

  return {
    condition: `oc.category_english = $${startParamIndex}`,
    params: [resolution.english],
    nextParamIndex: startParamIndex + 1,
    assumptions,
  }
}
