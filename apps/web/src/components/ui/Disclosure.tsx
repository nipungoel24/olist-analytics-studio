'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface DisclosureProps {
  summary: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

export function Disclosure({ summary, children, defaultOpen = false, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    if (open) {
      el.style.height = `${el.scrollHeight}px`
      el.style.opacity = '1'
    } else {
      el.style.height = '0px'
      el.style.opacity = '0'
    }
  }, [open])

  return (
    <div className={cn('rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]', className)}>
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-[14px] font-medium text-[var(--color-foreground)] hover:bg-[var(--color-surface-muted)]"
        aria-expanded={open}
      >
        {summary}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-[height,opacity] duration-200"
        role="region"
        aria-hidden={!open}
      >
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          {children}
        </div>
      </div>
    </div>
  )
}
