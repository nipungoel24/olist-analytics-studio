'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { ChartCard } from '@/components/ChartCard'
import { DataTable } from '@/components/DataTable'
import { InsightCard } from '@/components/InsightCard'
import { StatusBadge } from '@/components/StatusBadge'
import { EmptyState } from '@/components/EmptyState'
import { Disclosure } from '@/components/ui/Disclosure'
import { createAnalysis, createPin } from '@/lib/api'
import { announce } from '@/lib/announce'
import type { AnalysisResult } from '@/lib/api'
import type { ChartConfig } from '@olist/contracts'

const EXAMPLES = [
  'What are my top 5 products by revenue?',
  'Show order volume trend by month',
  'Average delivery time by state',
  'Payment method distribution',
]

interface ExplorePageProps {
  onPinCreated?: () => void
}

export function ExplorePage({ onPinCreated }: ExplorePageProps) {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedChart, setSelectedChart] = useState<number>(0)
  const [pinning, setPinning] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pinTitle, setPinTitle] = useState('')
  const [showPinForm, setShowPinForm] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)
  const pinInputRef = useRef<HTMLInputElement>(null)

  const handleAnalyze = useCallback(async () => {
    if (!question.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setPinned(false)
    setSelectedChart(0)
    try {
      const res = await createAnalysis(question.trim())
      setResult(res)
      if (res.status === 'error') {
        setError(res.message ?? 'Analysis failed')
        announce('Analysis failed')
      } else {
        const modeText = res.actualMode === 'llm' ? 'AI' : 'fallback'
        if (res.status === 'partial') {
          announce(`Partial analysis completed using ${modeText} mode`)
        } else if (res.status === 'empty') {
          announce('Analysis returned no data')
        } else if (res.status === 'unsupported') {
          announce('This question type is not supported')
        } else {
          announce(`Analysis completed using ${modeText} mode`)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
      announce('Analysis failed')
    } finally {
      setLoading(false)
    }
  }, [question])

  const handlePin = useCallback(async () => {
    if (!result?.analysisId) return
    setPinning(true)
    try {
      await createPin(result.analysisId, selectedChart, pinTitle.trim() || undefined)
      setPinned(true)
      setShowPinForm(false)
      announce('Analysis pinned to dashboard')
      onPinCreated?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to pin'
      setError(msg)
      announce('Failed to pin analysis')
    } finally {
      setPinning(false)
    }
  }, [result, selectedChart, pinTitle, onPinCreated])

  const handleExample = useCallback((ex: string) => {
    setQuestion(ex)
  }, [])

  const openPinForm = useCallback(() => {
    setShowPinForm(true)
    setTimeout(() => pinInputRef.current?.focus(), 0)
  }, [])

  const closePinForm = useCallback(() => {
    setShowPinForm(false)
    setPinTitle('')
  }, [])

  useEffect(() => {
    if (!showPinForm) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePinForm()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showPinForm, closePinForm])

  const chartOptions = (result?.chartOptions ?? []) as ChartConfig[]

  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-semibold leading-[32px] text-[var(--color-foreground)]">
        Explore
      </h1>

      {/* Query composer */}
      <Card>
        <CardHeader>
          <CardTitle>Ask a question</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-3">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What are my top 5 products by revenue?"
                className="min-h-[60px] flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAnalyze()
                  }
                }}
                aria-label="Analysis question"
              />
              <Button
                onClick={handleAnalyze}
                disabled={!question.trim() || loading}
                className="min-h-[44px] self-end"
              >
                {loading ? 'Analyzing...' : 'Analyze'}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-[12px] text-[var(--color-muted-foreground)]">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleExample(ex)}
                  className="rounded-full border border-[var(--color-border)] bg-transparent px-3 py-1 text-[12px] text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-foreground)]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-[32px] w-[200px]" />
          <Skeleton className="h-[260px] sm:h-[300px] w-full" />
          <Skeleton className="h-[120px] w-full" />
        </div>
      )}

      {/* Error */}
      {error && (
        <EmptyState
          title="Analysis failed"
          message={error}
          action={
            <Button variant="outline" onClick={handleAnalyze}>
              Try again
            </Button>
          }
        />
      )}

      {/* Result */}
      {result && !loading && (
        <div ref={resultRef} tabIndex={-1} className="space-y-4">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={result.status} />
            <Badge variant="outline">
              {result.actualMode === 'llm' ? 'AI' : 'Fallback'}
            </Badge>
            {result.chartType && (
              <Badge variant="default">{result.chartType}</Badge>
            )}
            {result.warnings.length > 0 && (
              <span className="text-[12px] text-[var(--color-warning)]">
                {result.warnings.length} warning(s)
              </span>
            )}
          </div>

          {/* Original question */}
          <p className="text-[14px] leading-[22px] text-[var(--color-muted-foreground)]">
            {result.originalQuestion}
          </p>

          {/* Partial status */}
          {result.status === 'partial' && (
            <Card className="border-[var(--color-warning)] bg-[var(--color-warning)]/5">
              <CardContent className="p-4">
                <p className="text-[14px] text-[var(--color-warning)]">
                  Partial results — some data sources may be unavailable.
                  {result.fallbackReason && ` ${result.fallbackReason}`}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Empty / Unsupported */}
          {(result.status === 'empty' || result.status === 'unsupported') && (
            <EmptyState
              title={result.status === 'empty' ? 'No data found' : 'Unsupported question'}
              message={result.status === 'empty'
                ? 'No rows matched your question. Try rephrasing or adjusting filters.'
                : 'This type of analysis is not yet supported. Try a different approach.'}
              action={
                <Button variant="outline" onClick={() => { setResult(null); setQuestion('') }}>
                  Start over
                </Button>
              }
            />
          )}

          {/* Chart + table for success/partial */}
          {['success', 'partial'].includes(result.status) && chartOptions.length > 0 && (
            <>
              {/* Chart reason */}
              {result.chartReason && (
                <p className="text-[13px] leading-[20px] text-[var(--color-muted-foreground)]">
                  {result.chartReason}
                </p>
              )}

              {/* Chart options using Radix Tabs */}
              {chartOptions.length > 1 ? (
                <Tabs value={String(selectedChart)} onValueChange={(v) => setSelectedChart(Number(v))}>
                  <TabsList>
                    {chartOptions.map((opt, i) => (
                      <TabsTrigger key={opt.id} value={String(i)}>
                        {opt.title}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {chartOptions.map((opt, i) => (
                    <TabsContent key={opt.id} value={String(i)}>
                      <Card>
                        <CardHeader>
                          <CardTitle>{opt.title}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="min-h-[260px] sm:min-h-[300px]">
                            <ChartCard config={opt} className="h-full min-h-[260px] sm:min-h-[300px] w-full" />
                          </div>
                          {opt.description && (
                            <p className="mt-3 text-[13px] leading-[20px] text-[var(--color-muted-foreground)]">
                              {opt.description}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>{chartOptions[0]?.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="min-h-[260px] sm:min-h-[300px]">
                      <ChartCard config={chartOptions[0]!} className="h-full min-h-[260px] sm:min-h-[300px] w-full" />
                    </div>
                    {chartOptions[0]?.description && (
                      <p className="mt-3 text-[13px] leading-[20px] text-[var(--color-muted-foreground)]">
                        {chartOptions[0]!.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Data table */}
              {result.normalizedData?.rows && result.normalizedData.rows.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-[14px]">Data</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={Object.keys(result.normalizedData.rows[0]!)}
                      rows={result.normalizedData.rows}
                      maxRows={20}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Insight */}
              <InsightCard
                insight={result.insight}
                insightEvidence={result.insightEvidence}
              />

              {/* Assumptions */}
              {result.assumptions.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <p className="mb-1 text-[12px] font-medium text-[var(--color-muted-foreground)]">
                      Assumptions
                    </p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {result.assumptions.map((a, i) => (
                        <li key={i} className="text-[13px] text-[var(--color-muted-foreground)]">
                          {a}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* How this was calculated */}
              <HowThisWasCalculated result={result} />

              {/* Pin section */}
              <Card>
                <CardContent className="p-4">
                  {pinned ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Pinned to dashboard</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={openPinForm}
                      >
                        Pin another copy
                      </Button>
                    </div>
                  ) : showPinForm ? (
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label htmlFor="pin-title" className="mb-1 block text-[12px] font-medium text-[var(--color-muted-foreground)]">
                          Title (optional)
                        </label>
                        <input
                          ref={pinInputRef}
                          id="pin-title"
                          type="text"
                          value={pinTitle}
                          onChange={(e) => setPinTitle(e.target.value)}
                          placeholder={chartOptions[selectedChart]?.title}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handlePin()
                            }
                          }}
                          className="w-full rounded-[var(--radius-control)] border border-[var(--color-border)] px-3 py-2 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                        />
                      </div>
                      <Button onClick={handlePin} disabled={pinning}>
                        {pinning ? 'Pinning...' : 'Confirm'}
                      </Button>
                      <Button variant="ghost" onClick={closePinForm}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button onClick={openPinForm}>
                      Pin to dashboard
                    </Button>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function HowThisWasCalculated({ result }: { result: AnalysisResult }) {
  const hasEvidence = result.insightEvidence && result.insightEvidence.length > 0
  const hasSources = result.sources && result.sources.length > 0
  const hasFilters = result.resolvedFilters && Object.keys(result.resolvedFilters).length > 0
  const hasWarnings = result.warnings.length > 0
  const hasVersion = result.dataVersion !== null

  if (!hasEvidence && !hasSources && !hasFilters && !hasWarnings && !hasVersion) {
    return null
  }

  return (
    <Disclosure summary={<span className="text-[14px]">How this was calculated</span>}>
      <div className="space-y-4">
        {/* Tool sources */}
        {hasSources && (
          <div>
            <p className="mb-1 text-[12px] font-medium text-[var(--color-muted-foreground)]">
              Data sources
            </p>
            <div className="space-y-1">
              {result.sources!.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px]">
                  <Badge variant={s.status === 'success' ? 'success' : s.status === 'failed' ? 'destructive' : 'outline'}>
                    {s.status}
                  </Badge>
                  <span className="font-medium text-[var(--color-foreground)]">{s.tool}</span>
                  {s.rowCount !== undefined && (
                    <span className="text-[var(--color-muted-foreground)]">
                      {s.rowCount.toLocaleString()} rows
                    </span>
                  )}
                  {s.errorMessage && (
                    <span className="text-[var(--color-destructive)]">{s.errorMessage}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metrics / insight evidence */}
        {hasEvidence && (
          <div>
            <p className="mb-1 text-[12px] font-medium text-[var(--color-muted-foreground)]">
              Metrics
            </p>
            <div className="flex flex-wrap gap-2">
              {result.insightEvidence!.map((e, i) => (
                <span key={i} className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-[12px] text-[var(--color-muted-foreground)]">
                  {e.operation}: {e.key ? `${e.key} · ` : ''}{e.metric} = {e.value.toLocaleString()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Resolved filters */}
        {hasFilters && (
          <div>
            <p className="mb-1 text-[12px] font-medium text-[var(--color-muted-foreground)]">
              Applied filters
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.resolvedFilters).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-[12px]">
                  <span className="font-medium text-[var(--color-foreground)]">{k}</span>
                  <span className="text-[var(--color-muted-foreground)]">{String(v)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Data version */}
        {hasVersion && (
          <div>
            <p className="text-[12px] text-[var(--color-muted-foreground)]">
              Dataset version: <span className="font-medium text-[var(--color-foreground)]">{result.dataVersion}</span>
            </p>
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div>
            <p className="mb-1 text-[12px] font-medium text-[var(--color-warning)]">
              Warnings
            </p>
            <ul className="list-inside list-disc space-y-0.5">
              {result.warnings.map((w, i) => (
                <li key={i} className="text-[12px] text-[var(--color-muted-foreground)]">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Disclosure>
  )
}
