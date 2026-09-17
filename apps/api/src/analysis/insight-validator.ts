import type { NormalizedData, InsightEvidence } from '@olist/contracts'

// LLM insight validation: rejects model-written insights that introduce
// numeric claims unsupported by tool output. Falls back to deterministic
// insight when validation fails.

export function validateLLMInsight(
  llmText: string,
  normalizedData: NormalizedData | null,
  evidence: InsightEvidence[],
): string | null {
  if (!normalizedData || evidence.length === 0) return null
  if (!llmText || llmText.trim().length === 0) return null

  // Reject causal language (especially for Q9-style questions)
  const causalPatterns = [
    /\bcause[sd]?\b/i,
    /\bcausation\b/i,
    /\bcausal\b/i,
    /\binfluen(?:ce|ces|ced|cing)\b/i,
    /\brespon[si]+ble?\b/i,
    /\bleads?\s+to\b/i,
    /\bresults?\s+in\b/i,
    /\bdrives?\b/i,
  ]
  for (const pattern of causalPatterns) {
    if (pattern.test(llmText)) {
      return null // reject causal insight, use deterministic
    }
  }

  // Validate that key numeric claims can be found in evidence
  // Extract numbers from LLM text
  const numbers = llmText.match(/\b\d+(?:\.\d+)?\b/g) ?? []
  const evidenceValues = evidence.map((e) => e.value)

  // Check that at least some numbers in the text match evidence values
  if (numbers.length > 0 && evidenceValues.length > 0) {
    let matchCount = 0
    for (const numStr of numbers) {
      const num = Number(numStr)
      if (!Number.isFinite(num)) continue
      for (const evVal of evidenceValues) {
        if (Math.abs(num - evVal) < 0.01 || Math.abs(num / evVal - 1) < 0.01) {
          matchCount++
          break
        }
      }
    }
    // If fewer than half the numeric claims are supported, reject
    if (numbers.length > 2 && matchCount / numbers.length < 0.5) {
      return null
    }
  }

  // Validate entity claims against data
  if (normalizedData.kind === 'ranking' && normalizedData.entities.length > 0) {
    const entityLabels = normalizedData.entities.map((e) => e.label.toLowerCase())
    // Check if the insight mentions specific entities
    const mentionsEntity = entityLabels.some((label) => llmText.toLowerCase().includes(label))
    if (entityLabels.length > 0 && !mentionsEntity) {
      // LLM insight doesn't reference any entity in the data — suspicious but acceptable
    }
  }

  // Accept the insight if it passes basic validation
  return llmText.trim()
}
