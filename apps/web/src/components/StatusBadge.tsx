'use client'

import { Badge } from '@/components/ui/Badge'

interface StatusBadgeProps {
  status: string
  className?: string
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  success: { label: 'Success', variant: 'success' },
  partial: { label: 'Partial', variant: 'warning' },
  empty: { label: 'No Data', variant: 'destructive' },
  unsupported: { label: 'Unsupported', variant: 'destructive' },
  needs_clarification: { label: 'Needs Clarification', variant: 'warning' },
  error: { label: 'Error', variant: 'destructive' },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? { label: status, variant: 'default' as const }
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  )
}
