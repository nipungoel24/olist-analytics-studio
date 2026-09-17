// API client — mirrors the actual backend wire contract.
// The backend sends AgentResult directly (apps/api/src/routes/analyses.ts line 119).

const API_BASE = ''

export interface ToolProvenance {
  nodeId: string
  tool: string
  params: Record<string, unknown>
  status: 'success' | 'failed' | 'empty'
  rowCount?: number
  dataVersion?: string
  errorCode?: string
  errorMessage?: string
}

export interface InsightEvidence {
  operation: 'max' | 'min' | 'share' | 'count' | 'descriptive_comparison' | 'peak'
  key?: string
  metric: string
  value: number
  rowsUsed: number
}

export interface AnalysisResult {
  status: 'success' | 'partial' | 'empty' | 'unsupported' | 'needs_clarification' | 'error'
  analysisId?: string
  originalQuestion: string
  actualMode: 'llm' | 'fallback'
  fallbackReason?: string
  resolvedFilters: Record<string, unknown>
  assumptions: string[]
  normalizedData?: { kind: string; rows: Record<string, unknown>[] } | null
  chartOptions: unknown[]
  chartType: string | null
  chartReason: string | null
  insight: string | null
  insightEvidence?: InsightEvidence[]
  warnings: string[]
  sources: ToolProvenance[]
  dataVersion: string | null
  executablePlan?: unknown
  message?: string
  errorCode?: string
}

export interface Pin {
  pinId: string
  analysisId: string
  latestSnapshotId: string
  chosenChartOption: number
  planVersion: number
  title: string | null
  createdAt: string
  updatedAt: string
  originalQuestion: string
  snapshotStatus: string
  insight: string | null
  chartOptions: unknown[]
}

export interface RefreshResult {
  refreshId: string
  status: 'success' | 'partial' | 'failed' | 'not_comparable' | 'conflict'
  diff?: {
    status: 'unchanged' | 'changed' | 'not_comparable' | 'failed'
    diffs?: Array<{
      metric: string
      label: string
      oldValue: number | null
      newValue: number | null
      change: number | null
      thresholdMet: boolean
      kind: 'metric' | 'structural'
    }>
    structuralChanges?: Array<{
      type: 'entity_added' | 'entity_removed' | 'top_n_membership_change'
      entity?: string
    }>
    summary?: string
  }
  error?: string
}

export async function createAnalysis(question: string): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.message ?? error.error ?? 'Failed to create analysis')
  }
  return res.json()
}

export async function createPin(
  analysisId: string,
  chartOptionId?: number,
  title?: string
): Promise<Pin> {
  const res = await fetch(`${API_BASE}/api/pins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysisId, chartOptionId, title }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.message ?? error.error ?? 'Failed to create pin')
  }
  return res.json()
}

export async function getPins(): Promise<Pin[]> {
  const res = await fetch(`${API_BASE}/api/pins`)
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.message ?? error.error ?? 'Failed to get pins')
  }
  return res.json()
}

export async function deletePin(pinId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/pins/${pinId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.message ?? error.error ?? 'Failed to delete pin')
  }
}

export async function refreshPin(pinId: string): Promise<RefreshResult> {
  const res = await fetch(`${API_BASE}/api/pins/${pinId}/refresh`, {
    method: 'POST',
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.message ?? error.error ?? 'Failed to refresh pin')
  }
  return res.json()
}
