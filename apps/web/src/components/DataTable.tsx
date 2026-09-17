'use client'

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'

interface DataTableProps {
  columns: string[]
  rows: Record<string, unknown>[]
  maxRows?: number
  className?: string
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'number') return val.toLocaleString()
  if (typeof val === 'string') {
    const d = new Date(val)
    if (!isNaN(d.getTime()) && val.includes('T')) {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }
    return val
  }
  return String(val)
}

export function DataTable({ columns, rows, maxRows = 20, className }: DataTableProps) {
  const displayRows = rows.slice(0, maxRows)

  return (
    <div className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col}>{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayRows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col}>{formatValue(row[col])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > maxRows && (
        <p className="mt-2 text-[12px] text-[var(--color-muted-foreground)]">
          Showing {maxRows} of {rows.length.toLocaleString()} rows
        </p>
      )}
    </div>
  )
}
