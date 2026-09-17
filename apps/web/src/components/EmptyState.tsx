'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'

interface EmptyStateProps {
  title?: string
  message?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  title = 'No data available',
  message = 'This analysis returned no data. Try a different question.',
  action,
  className,
}: EmptyStateProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-[18px]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-[14px] leading-[22px] text-[var(--color-muted-foreground)]">{message}</p>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  )
}
