'use client'

import { useState, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ChartCard } from '@/components/ChartCard'
import { InsightCard } from '@/components/InsightCard'
import { StatusBadge } from '@/components/StatusBadge'
import { Disclosure } from '@/components/ui/Disclosure'
import { RefreshIcon } from '@/components/Icons'
import { announce } from '@/lib/announce'
import type { ChartConfig } from '@olist/contracts'
import type { Pin, RefreshResult } from '@/lib/api'

interface PinCardProps {
  pin: Pin
  onDelete: (pinId: string) => void
  onRefresh: (pinId: string) => Promise<RefreshResult>
}

export function PinCard({ pin, onDelete, onRefresh }: PinCardProps) {
  const chartOptions = (pin.chartOptions ?? []) as ChartConfig[]
  const chosenChart = chartOptions[pin.chosenChartOption] ?? chartOptions[0]

  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState<RefreshResult | null>(null)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setRefreshResult(null)
    try {
      const result = await onRefresh(pin.pinId)
      setRefreshResult(result)
      if (result.status === 'success') {
        announce(`Refresh completed: ${result.diff?.status === 'changed' ? 'significant changes detected' : 'no significant change'}`)
      } else if (result.status === 'partial') {
        announce('Partial refresh — some data sources unavailable')
      } else if (result.status === 'failed') {
        announce('Refresh failed')
      } else if (result.status === 'not_comparable') {
        announce('Refresh completed — data could not be compared')
      }
    } catch {
      setRefreshResult({ refreshId: '', status: 'failed', error: 'Network error' })
      announce('Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }, [pin.pinId, onRefresh])

  const handleDelete = useCallback(() => {
    onDelete(pin.pinId)
    announce(`${pin.title ?? 'Analysis'} removed from dashboard`)
  }, [pin.pinId, pin.title, onDelete])

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-[16px] leading-[24px]">
            {pin.title ?? chosenChart?.title ?? 'Untitled'}
          </CardTitle>
          <StatusBadge status={pin.snapshotStatus} />
        </div>
        <p className="text-[12px] text-[var(--color-muted-foreground)]">
          {pin.originalQuestion}
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {chosenChart && (
          <div className="min-h-[260px] sm:min-h-[300px]">
            <ChartCard config={chosenChart} className="h-full min-h-[260px] sm:min-h-[300px] w-full" />
          </div>
        )}

        {pin.insight && (
          <InsightCard insight={pin.insight} />
        )}

        {/* Refresh result */}
        {refreshResult && (
          <RefreshResultDisplay result={refreshResult} />
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label={`Refresh ${pin.title ?? 'analysis'}`}
          >
            <RefreshIcon size={16} label="Refresh" />
            <span className="ml-1">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            aria-label={`Remove ${pin.title ?? 'analysis'} from dashboard`}
          >
            Remove
          </Button>
          <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)]">
            {new Date(pin.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function RefreshResultDisplay({ result }: { result: RefreshResult }) {
  const { status, diff, error } = result

  if (status === 'success') {
    if (diff?.status === 'unchanged') {
      return (
        <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[13px] text-[var(--color-muted-foreground)]">
          No significant change
        </div>
      )
    }
    if (diff?.status === 'changed') {
      return (
        <Disclosure
          summary={
            <span className="text-[13px] text-[var(--color-warning)]">
              Significant changes detected
              {diff.diffs && diff.diffs.length > 0 && ` (${diff.diffs.length} metric${diff.diffs.length > 1 ? 's' : ''})`}
            </span>
          }
        >
          <div className="space-y-2">
            {diff.diffs?.filter((d) => d.thresholdMet).map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="font-medium text-[var(--color-foreground)]">{d.label}</span>
                <span className="text-[var(--color-muted-foreground)]">
                  {d.oldValue !== null ? d.oldValue.toLocaleString() : '—'}
                  {' → '}
                  {d.newValue !== null ? d.newValue.toLocaleString() : '—'}
                </span>
              </div>
            ))}
            {diff.structuralChanges?.map((s, i) => (
              <div key={i} className="text-[12px] text-[var(--color-muted-foreground)]">
                {s.type === 'entity_added' && `Added: ${s.entity}`}
                {s.type === 'entity_removed' && `Removed: ${s.entity}`}
                {s.type === 'top_n_membership_change' && `Ranking changed: ${s.entity}`}
              </div>
            ))}
          </div>
        </Disclosure>
      )
    }
    if (diff?.status === 'not_comparable') {
      return (
        <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[13px] text-[var(--color-muted-foreground)]">
          Could not compare — data format changed
        </div>
      )
    }
    return null
  }

  if (status === 'partial') {
    return (
      <div className="rounded-[var(--radius-control)] border border-[var(--color-warning)] bg-[var(--color-warning)]/5 px-3 py-2 text-[13px] text-[var(--color-warning)]">
        Partial refresh — some data sources unavailable. Previous data retained.
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="rounded-[var(--radius-control)] border border-[var(--color-destructive)] bg-[var(--color-destructive)]/5 px-3 py-2 text-[13px] text-[var(--color-destructive)]">
        Refresh failed{error ? `: ${error}` : ''}. Previous data retained.
      </div>
    )
  }

  if (status === 'not_comparable') {
    return (
      <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[13px] text-[var(--color-muted-foreground)]">
        Could not compare — data format changed between versions
      </div>
    )
  }

  if (status === 'conflict') {
    return (
      <div className="rounded-[var(--radius-control)] border border-[var(--color-warning)] bg-[var(--color-warning)]/5 px-3 py-2 text-[13px] text-[var(--color-warning)]">
        Concurrent update detected — please refresh again
      </div>
    )
  }

  return null
}
