'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/EmptyState'
import { PinCard } from '@/components/PinCard'
import { getPins, deletePin, refreshPin } from '@/lib/api'
import type { Pin } from '@/lib/api'

interface DashboardPageProps {
  refreshTrigger?: number
}

export function DashboardPage({ refreshTrigger }: DashboardPageProps) {
  const [pins, setPins] = useState<Pin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPins = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getPins()
      setPins(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPins()
  }, [loadPins, refreshTrigger])

  const handleDelete = useCallback(async (pinId: string) => {
    try {
      await deletePin(pinId)
      setPins((prev) => prev.filter((p) => p.pinId !== pinId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete pin')
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-semibold leading-[32px] text-[var(--color-foreground)]">
          Dashboard
        </h1>
        {pins.length > 0 && (
          <Badge variant="default">
            {pins.length} pinned
          </Badge>
        )}
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-[260px] sm:h-[300px] w-full" />
              <Skeleton className="h-[40px] w-[60%]" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <EmptyState
          title="Failed to load dashboard"
          message={error}
          action={
            <Button variant="outline" onClick={loadPins}>
              Retry
            </Button>
          }
        />
      )}

      {!loading && !error && pins.length === 0 && (
        <EmptyState
          title="No pinned analyses"
          message="Go to Explore, run a query, and pin an analysis to see it here."
          action={
            <Button onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'explore' }))}>
              Go to Explore
            </Button>
          }
        />
      )}

      {!loading && !error && pins.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2" role="list" aria-label="Pinned analyses">
          {pins.map((pin) => (
            <div key={pin.pinId} role="listitem">
              <PinCard
                pin={pin}
                onDelete={handleDelete}
                onRefresh={refreshPin}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
