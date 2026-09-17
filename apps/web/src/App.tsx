'use client'

import { useState, useCallback, useEffect } from 'react'
import { AppShell } from '@/components/AppShell'
import { ExplorePage } from '@/pages/ExplorePage'
import { DashboardPage } from '@/pages/DashboardPage'

export default function App() {
  const [view, setView] = useState<'explore' | 'dashboard'>('explore')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleNavigate = useCallback((v: 'explore' | 'dashboard') => {
    setView(v)
    if (v === 'dashboard') {
      setRefreshTrigger((n) => n + 1)
    }
  }, [])

  const handlePinCreated = useCallback(() => {
    setRefreshTrigger((n) => n + 1)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as 'explore' | 'dashboard'
      if (detail) handleNavigate(detail)
    }
    window.addEventListener('navigate', handler)
    return () => window.removeEventListener('navigate', handler)
  }, [handleNavigate])

  return (
    <AppShell currentView={view} onNavigate={handleNavigate}>
      {view === 'explore' ? (
        <ExplorePage onPinCreated={handlePinCreated} />
      ) : (
        <DashboardPage refreshTrigger={refreshTrigger} />
      )}
    </AppShell>
  )
}
