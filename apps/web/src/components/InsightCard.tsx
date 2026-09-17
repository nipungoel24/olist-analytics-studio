'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'

interface InsightCardProps {
  insight: string | null
  insightEvidence?: { operation: string; key?: string; metric: string; value: number; rowsUsed: number }[]
  className?: string
}

export function InsightCard({ insight, insightEvidence, className }: InsightCardProps) {
  if (!insight) return null

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-[14px] font-medium text-[var(--color-muted-foreground)]">
          Insight
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-[14px] leading-[22px] text-[var(--color-foreground)]">{insight}</p>
        {insightEvidence && insightEvidence.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {insightEvidence.map((e, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-2.5 py-0.5 text-[12px] text-[var(--color-muted-foreground)]"
              >
                {e.operation}: {e.key ? `${e.key} · ` : ''}{e.metric} = {e.value.toLocaleString()}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
