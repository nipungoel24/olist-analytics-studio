import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

test.describe('200% Zoom Verification', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`)
    // Emulate 200% zoom via CSS scale
    await page.addStyleTag({ content: 'html { zoom: 2; }' })
    await page.waitForTimeout(500)
  })

  test('Explore page remains usable at 200% zoom', async ({ page }) => {
    // Navigation remains visible
    await expect(page.getByRole('button', { name: 'Explore' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible()

    // Query composer remains accessible
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()
    await textarea.fill('Show monthly revenue trend for 2017')
    await expect(textarea).toHaveValue('Show monthly revenue trend for 2017')

    // Analyze button remains reachable
    const analyzeBtn = page.locator('button:has-text("Analyze")')
    await expect(analyzeBtn).toBeVisible()
    await expect(analyzeBtn).toBeEnabled()

    // Submit and verify result
    await analyzeBtn.click()
    const canvas = page.locator('canvas[role="img"]').first()
    await expect(canvas).toBeVisible({ timeout: 90000 })

    // Pin button remains reachable
    const pinBtn = page.locator('button:has-text("Pin to Dashboard")')
    await expect(pinBtn).toBeVisible()

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10) // small tolerance
  })

  test('Dashboard page remains usable at 200% zoom', async ({ page }) => {
    // Navigate to Dashboard
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
    await page.waitForTimeout(500)

    // Dashboard heading visible
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    // Empty state or pin cards visible
    const emptyState = page.locator('text=No pinned analyses')
    const pinCards = page.locator('[role="listitem"]')
    const hasContent = (await emptyState.count()) > 0 || (await pinCards.count()) > 0
    expect(hasContent).toBeTruthy()

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10)
  })

  test('Focus indicators remain visible at 200% zoom', async ({ page }) => {
    // Tab to textarea
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Check focus ring is visible
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()

    // Verify focus styling
    const outline = await focused.evaluate((el) => {
      const style = window.getComputedStyle(el)
      return style.outlineStyle || style.boxShadow
    })
    expect(outline).not.toBe('none')
  })

  test('Chart labels remain readable at 200% zoom', async ({ page }) => {
    // Submit a query
    const textarea = page.locator('textarea')
    await textarea.fill('Show monthly revenue trend for 2017')
    await page.locator('button:has-text("Analyze")').click()

    // Wait for chart
    const canvas = page.locator('canvas[role="img"]').first()
    await expect(canvas).toBeVisible({ timeout: 90000 })

    // Chart container has minimum height
    const chartContainer = canvas.locator('..')
    const height = await chartContainer.evaluate((el) => el.offsetHeight)
    expect(height).toBeGreaterThanOrEqual(260) // minimum chart height

    // Canvas has accessible label
    await expect(canvas).toHaveAttribute('aria-label')
    await expect(canvas).toHaveAttribute('role', 'img')
  })

  test('Data table remains usable at 200% zoom', async ({ page }) => {
    // Submit a query
    const textarea = page.locator('textarea')
    await textarea.fill('Show monthly revenue trend for 2017')
    await page.locator('button:has-text("Analyze")').click()

    // Wait for result
    await expect(page.locator('canvas[role="img"]').first()).toBeVisible({ timeout: 90000 })

    // Click Show Data button
    const showDataBtn = page.locator('button:has-text("Show Data")')
    if (await showDataBtn.isVisible()) {
      await showDataBtn.click()

      // Table appears
      const table = page.locator('table')
      await expect(table).toBeVisible()

      // Table has tabular-nums styling
      const cells = page.locator('td')
      if ((await cells.count()) > 0) {
        const fontVariant = await cells.first().evaluate((el) => {
          return window.getComputedStyle(el).fontVariantNumeric
        })
        expect(fontVariant).toContain('tabular-nums')
      }
    }
  })
})
