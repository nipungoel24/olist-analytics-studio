'use client'

import { type ReactNode } from 'react'
import postgresql from '@thesvg/icons/postgresql'
import { cn } from '@/lib/utils'

interface AppShellProps {
  currentView: 'explore' | 'dashboard'
  onNavigate: (view: 'explore' | 'dashboard') => void
  children: ReactNode
}

export function AppShell({ currentView, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[var(--z-dialog)] focus:rounded-[var(--radius-control)] focus:bg-[var(--color-primary)] focus:px-4 focus:py-2 focus:text-[14px] focus:text-[var(--color-primary-foreground)]"
      >
        Skip to content
      </a>

      <header
        className="sticky top-0 z-[var(--z-nav)] border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3"
        role="banner"
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[18px] font-semibold leading-[26px] text-[var(--color-foreground)]">
              Olist Analytics Studio
            </span>
          </div>
          <nav className="flex items-center gap-1" role="navigation" aria-label="Main">
            <button
              onClick={() => onNavigate('explore')}
              className={cn(
                'rounded-[var(--radius-control)] px-4 py-2 text-[14px] font-medium transition-colors',
                currentView === 'explore'
                  ? 'bg-[var(--color-surface-muted)] text-[var(--color-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-foreground)]'
              )}
              aria-current={currentView === 'explore' ? 'page' : undefined}
            >
              Explore
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className={cn(
                'rounded-[var(--radius-control)] px-4 py-2 text-[14px] font-medium transition-colors',
                currentView === 'dashboard'
                  ? 'bg-[var(--color-surface-muted)] text-[var(--color-foreground)]'
                  : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-foreground)]'
              )}
              aria-current={currentView === 'dashboard' ? 'page' : undefined}
            >
              Dashboard
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-6" id="main-content" role="main">
        {children}
      </main>

      <div aria-live="polite" aria-atomic="true" className="sr-only" id="status-announcer" />

      <footer className="border-t border-[var(--color-border)] px-6 py-4 text-center text-[12px] text-[var(--color-muted-foreground)]" role="contentinfo">
        <span>Powered by </span>
        <span className="inline-flex items-center gap-1">
          <PostgreSQLIcon />
          PostgreSQL
        </span>
        <span> · </span>
        <a
          href="https://thesvg.org/icon/postgresql"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-[var(--color-foreground)]"
        >
          PostgreSQL icon (thesvg.org, MIT)
        </a>
      </footer>
    </div>
  )
}

function PostgreSQLIcon() {
  return (
    <span
      className="inline-block h-4 w-4"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: postgresql.svg }}
    />
  )
}
