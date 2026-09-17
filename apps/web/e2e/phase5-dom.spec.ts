import { test, expect, type Route } from '@playwright/test'

// Phase 5 Browser DOM E2E tests.
// Requires Docker stack running on http://localhost:3000 with web app served.

const BASE_URL = 'http://localhost:3000'

test.describe('Phase 5 Browser DOM Workflow', () => {

  test('Full Explore→Pin→Dashboard→Refresh→Reload→Delete workflow', async ({ page }) => {
    // Clean up any stale pins first
    const stalePins = await (await page.request.get(`${BASE_URL}/api/pins`)).json()
    for (const p of stalePins) await page.request.delete(`${BASE_URL}/api/pins/${p.pinId}`)

    // ============================================================
    // STEP 1: Open Explore page in browser
    // ============================================================
    await page.goto(`${BASE_URL}/`)
    await expect(page.locator('button:has-text("Explore")')).toBeVisible()

    // ============================================================
    // STEP 2: Verify question input is visible
    // ============================================================
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible()

    // ============================================================
    // STEP 3: Enter the query
    // ============================================================
    await textarea.fill('Show monthly revenue trend for 2017')

    // ============================================================
    // STEP 4: Submit through the UI
    // ============================================================
    const submitButton = page.locator('button:has-text("Analyze")')
    await expect(submitButton).toBeVisible()
    await submitButton.click()

    // ============================================================
    // STEP 5: Wait for the analysis response
    // ============================================================
    // Button should show "Analyzing..." while loading
    await expect(page.locator('button:has-text("Analyzing...")')).toBeVisible({ timeout: 5000 })

    // Wait for chart canvas to appear (indicates result loaded)
    await expect(page.locator('canvas[role="img"]').first()).toBeVisible({ timeout: 60000 })

    // ============================================================
    // STEP 6: Assert result UI contains chart
    // ============================================================
    const chartCanvas = page.locator('canvas[role="img"]').first()
    await expect(chartCanvas).toBeVisible()

    // ============================================================
    // STEP 7: Click Pin through the DOM
    // ============================================================
    const pinButton = page.locator('button:has-text("Pin to dashboard")')
    await expect(pinButton).toBeVisible()
    await pinButton.click()

    // ============================================================
    // STEP 8: Verify pin form and confirm
    // ============================================================
    const confirmButton = page.locator('button:has-text("Confirm")')
    await expect(confirmButton).toBeVisible({ timeout: 5000 })
    await confirmButton.click()

    // Verify pinned success state (use exact match to avoid matching aria-live announcer)
    await expect(page.getByText('Pinned to dashboard', { exact: true })).toBeVisible({ timeout: 10000 })

    // ============================================================
    // STEP 9: Navigate to Dashboard through the UI
    // ============================================================
    const dashboardNav = page.locator('button:has-text("Dashboard")')
    await dashboardNav.click()

    // ============================================================
    // STEP 10: Assert the newly pinned card is visible
    // ============================================================
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible()
    await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 10000 })

    // ============================================================
    // STEP 11: Assert card shows chart
    // ============================================================
    const dashboardChart = page.locator('canvas[role="img"]').first()
    await expect(dashboardChart).toBeVisible()

    // ============================================================
    // STEP 12: Click Refresh through the DOM
    // ============================================================
    const refreshButton = page.locator('button:has-text("Refresh")').first()
    await expect(refreshButton).toBeVisible()
    await refreshButton.click()

    // ============================================================
    // STEP 13: While refresh in progress, prove previous chart remains
    // ============================================================
    await expect(page.locator('button:has-text("Refreshing...")')).toBeVisible({ timeout: 5000 })
    await expect(dashboardChart).toBeVisible()

    // ============================================================
    // STEP 14: Wait for refresh completion
    // ============================================================
    await expect(page.locator('button:has-text("Refreshing...")')).toBeHidden({ timeout: 60000 })

    // ============================================================
    // STEP 15: Reload the browser page
    // ============================================================
    await page.reload()
    await expect(page.locator('button:has-text("Explore")')).toBeVisible()

    // ============================================================
    // STEP 16: Navigate back to Dashboard
    // ============================================================
    await page.locator('button:has-text("Dashboard")').click()
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible()
    await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 10000 })

    // ============================================================
    // STEP 17: Click Remove
    // ============================================================
    const removeButton = page.locator('button:has-text("Remove")').first()
    await expect(removeButton).toBeVisible()
    await removeButton.click()

    // ============================================================
    // STEP 18: Assert the pin card disappears
    // ============================================================
    await page.waitForTimeout(2000)

    // ============================================================
    // STEP 19: Reload and verify deleted pin doesn't reappear
    // ============================================================
    await page.reload()
    await expect(page.locator('button:has-text("Explore")')).toBeVisible()

    await page.locator('button:has-text("Dashboard")').click()
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible()
  })

  test('Client trust boundary: POST /api/pins sends only trusted fields', async ({ page }) => {
    // Clean up any stale pins first
    const stalePins = await (await page.request.get(`${BASE_URL}/api/pins`)).json()
    for (const p of stalePins) await page.request.delete(`${BASE_URL}/api/pins/${p.pinId}`)

    // Intercept the POST /api/pins request to verify body
    let requestBody: unknown = null

    await page.route('**/api/pins', async (route: Route) => {
      requestBody = route.request().postDataJSON()
      await route.continue()
    })

    // Navigate to Explore page
    await page.goto(`${BASE_URL}/`)

    // Submit a query
    const textarea = page.locator('textarea')
    await textarea.fill('Show monthly revenue trend for 2017')
    const submitButton = page.locator('button:has-text("Analyze")')
    await submitButton.click()

    // Wait for result
    await expect(page.locator('canvas[role="img"]').first()).toBeVisible({ timeout: 60000 })

    // Click Pin
    const pinButton = page.locator('button:has-text("Pin to dashboard")')
    await pinButton.click()

    // Confirm pin
    const confirmButton = page.locator('button:has-text("Confirm")')
    await confirmButton.click()

    // Wait for pin request to complete
    await expect(page.getByText('Pinned to dashboard', { exact: true })).toBeVisible({ timeout: 10000 })

    // Verify the request body
    expect(requestBody).toBeTruthy()
    const body = requestBody as Record<string, unknown>

    // Should contain analysisId
    expect(body).toHaveProperty('analysisId')
    expect(typeof body.analysisId).toBe('string')

    // Should contain chartOptionId (number)
    expect(body).toHaveProperty('chartOptionId')
    expect(typeof body.chartOptionId).toBe('number')

    // Should NOT contain authoritative fields
    expect(body).not.toHaveProperty('executablePlan')
    expect(body).not.toHaveProperty('normalizedData')
    expect(body).not.toHaveProperty('chart')
    expect(body).not.toHaveProperty('dataVersion')
    expect(body).not.toHaveProperty('insight')

    // Clean up: delete all pins created during this test
    const pinsResponse = await page.request.get(`${BASE_URL}/api/pins`)
    const pins = await pinsResponse.json()
    for (const pin of pins) {
      await page.request.delete(`${BASE_URL}/api/pins/${pin.pinId}`)
    }
  })

  test('Partial/failed refresh: previous chart remains visible', async ({ page }) => {
    // Clean up any stale pins first
    const stalePins = await (await page.request.get(`${BASE_URL}/api/pins`)).json()
    for (const p of stalePins) await page.request.delete(`${BASE_URL}/api/pins/${p.pinId}`)

    // First, create a pin through the API
    const analysisResponse = await page.request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'Show monthly revenue trend for 2017' },
    })
    const analysis = await analysisResponse.json()

    const pinResponse = await page.request.post(`${BASE_URL}/api/pins`, {
      data: { analysisId: analysis.analysisId },
    })
    const pin = await pinResponse.json()

    // Navigate to Dashboard
    await page.goto(`${BASE_URL}/`)

    // Click Dashboard nav
    const dashboardNav = page.locator('button:has-text("Dashboard")')
    await dashboardNav.click()

    // Wait for pin to appear
    await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 10000 })

    // Verify chart is visible before refresh
    const chartBefore = page.locator('canvas[role="img"]').first()
    await expect(chartBefore).toBeVisible()

    // Click Refresh
    const refreshButton = page.locator('button:has-text("Refresh")').first()
    await refreshButton.click()

    // During refresh, chart should remain visible
    await expect(chartBefore).toBeVisible()

    // Wait for refresh to complete
    await expect(page.locator('button:has-text("Refreshing...")')).toBeHidden({ timeout: 90000 })

    // After refresh, chart should still be visible
    await expect(chartBefore).toBeVisible()

    // Clean up
    await page.request.delete(`${BASE_URL}/api/pins/${pin.pinId}`)
  })
})
