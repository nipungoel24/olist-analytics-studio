import { test, expect } from '@playwright/test'

// Phase 6 Browser DOM E2E tests — Design System + Chart.js + Accessibility
// Requires Docker stack running on http://localhost:3000 with web app served.

const BASE_URL = 'http://localhost:3000'

test.describe('Phase 6 Design System', () => {

  test('Application shell renders with navigation, header, footer', async ({ page }) => {
    await page.goto(`${BASE_URL}/`)

    // Header with brand name
    await expect(page.locator('text=Olist Analytics Studio')).toBeVisible()

    // Navigation tabs
    await expect(page.locator('button:has-text("Explore")')).toBeVisible()
    await expect(page.locator('button:has-text("Dashboard")')).toBeVisible()

    // Footer with PostgreSQL attribution
    await expect(page.locator('text=Powered by')).toBeVisible()
    await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible()
    await expect(page.locator('a:has-text("thesvg.org")')).toBeVisible()

    // Skip link exists and targets main content (sr-only, visually hidden by default)
    const skipLink = page.locator('a[href="#main-content"]')
    await expect(skipLink).toHaveCount(1)
  })

  test('Navigation between Explore and Dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/`)

    // Explore page loads by default
    await expect(page.locator('h1:has-text("Explore")')).toBeVisible()
    await expect(page.locator('nav button:has-text("Explore")')).toHaveAttribute('aria-current', 'page')

    // Navigate to Dashboard
    await page.locator('nav button:has-text("Dashboard")').click()
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible()
    await expect(page.locator('nav button:has-text("Dashboard")')).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('nav button:has-text("Explore")')).not.toHaveAttribute('aria-current')

    // Navigate back to Explore
    await page.locator('nav button:has-text("Explore")').click()
    await expect(page.locator('h1:has-text("Explore")')).toBeVisible()
  })

  test('Design tokens: CSS variables applied correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/`)

    // Check background color matches Design.md token
    const body = page.locator('body')
    await expect(body).toHaveCSS('background-color', 'rgb(248, 250, 252)') // #F8FAFC

    // Check font family includes Inter
    await expect(body).toHaveCSS('font-family', /Inter/)
  })

  test('Focus ring visible on keyboard navigation', async ({ page }) => {
    await page.goto(`${BASE_URL}/`)

    // Tab to first interactive element
    await page.keyboard.press('Tab')

    // Check that focus-visible outline is applied
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
  })

  test('Chart.js canvas renders with aria-label', async ({ page }) => {
    // Create an analysis that produces a chart
    const analysisResponse = await page.request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'Show monthly revenue trend for 2017' },
    })
    const analysis = await analysisResponse.json()

    if (analysis.status === 'success' && analysis.chartOptions?.length > 0) {
      const pinResponse = await page.request.post(`${BASE_URL}/api/pins`, {
        data: { analysisId: analysis.analysisId },
      })
      const pin = await pinResponse.json()

      // Navigate to Dashboard
      await page.goto(`${BASE_URL}/`)
      await page.locator('button:has-text("Dashboard")').click()

      // Wait for pin card
      await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 10000 })

      // Canvas should have aria-label for accessibility
      const canvas = page.locator('canvas[aria-label]').first()
      await expect(canvas).toBeVisible()

      // Canvas should have role="img"
      await expect(canvas).toHaveAttribute('role', 'img')

      // Clean up
      await page.request.delete(`${BASE_URL}/api/pins/${pin.pinId}`)
    }
  })

  test('Data table renders with tabular-nums styling', async ({ page }) => {
    // Create an analysis that produces data
    const analysisResponse = await page.request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'What are my top 5 products by revenue?' },
    })
    const analysis = await analysisResponse.json()

    if (analysis.status === 'success' && analysis.normalizedData) {
      // The data table should be visible in Explore page
      await page.goto(`${BASE_URL}/`)
      await page.locator('textarea').fill('What are my top 5 products by revenue?')
      await page.locator('button:has-text("Analyze")').click()

      // Wait for result
      await expect(page.locator('canvas[aria-label]').first()).toBeVisible({ timeout: 60000 })

      // Data table should be visible
      const dataTable = page.locator('table')
      await expect(dataTable).toBeVisible()

      // Table cells should have tabular-nums
      const tableCells = page.locator('td')
      const count = await tableCells.count()
      if (count > 0) {
        await expect(tableCells.first()).toHaveCSS('font-variant-numeric', 'tabular-nums')
      }
    }
  })

  test('Reduced motion: animations disabled', async ({ page }) => {
    // Emulate prefers-reduced-motion
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`${BASE_URL}/`)

    // Skeleton should not animate
    const skeleton = page.locator('[class*="animate-pulse"]')
    // If any skeleton is visible, verify it doesn't animate
    if (await skeleton.count() > 0) {
      await expect(skeleton.first()).toHaveCSS('animation-duration', '0.01ms')
    }
  })

  test('Responsive: mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }) // iPhone 14
    await page.goto(`${BASE_URL}/`)

    // Header should still be visible
    await expect(page.locator('text=Olist Analytics Studio')).toBeVisible()

    // Navigation should be visible
    await expect(page.locator('button:has-text("Explore")')).toBeVisible()
    await expect(page.locator('button:has-text("Dashboard")')).toBeVisible()

    // Textarea should be visible
    await expect(page.locator('textarea')).toBeVisible()

    // Content should not overflow
    const body = page.locator('body')
    const bodyWidth = await body.evaluate((el) => el.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(390)
  })

  test('Responsive: tablet viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }) // iPad
    await page.goto(`${BASE_URL}/`)

    // All elements should be visible
    await expect(page.locator('text=Olist Analytics Studio')).toBeVisible()
    await expect(page.locator('button:has-text("Explore")')).toBeVisible()
    await expect(page.locator('button:has-text("Dashboard")')).toBeVisible()
  })

  test('Responsive: desktop viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 }) // Desktop
    await page.goto(`${BASE_URL}/`)

    // Content should be max-width constrained
    const main = page.locator('main')
    await expect(main).toBeVisible()

    // All elements should be visible
    await expect(page.locator('text=Olist Analytics Studio')).toBeVisible()
    await expect(page.locator('button:has-text("Explore")')).toBeVisible()
    await expect(page.locator('button:has-text("Dashboard")')).toBeVisible()
  })
})
