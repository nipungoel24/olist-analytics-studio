import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

test.describe('Phase 6 Screenshots', () => {
  test('Explore empty state at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE_URL}/`)
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/screenshots/explore-empty-1440.png', fullPage: true })
  })

  test('Explore success at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE_URL}/`)
    await page.locator('textarea').fill('Show monthly revenue trend for 2017')
    await page.locator('button:has-text("Analyze")').click()
    await expect(page.locator('canvas[role="img"]').first()).toBeVisible({ timeout: 90000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/screenshots/explore-success-1440.png', fullPage: true })
  })

  test('Explore success at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE_URL}/`)
    await page.locator('textarea').fill('Show monthly revenue trend for 2017')
    await page.locator('button:has-text("Analyze")').click()
    await expect(page.locator('canvas[role="img"]').first()).toBeVisible({ timeout: 90000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/screenshots/explore-success-390.png', fullPage: true })
  })

  test('Dashboard with pins at 1440px', async ({ page }) => {
    const stalePins = await (await page.request.get(`${BASE_URL}/api/pins`)).json()
    for (const p of stalePins) await page.request.delete(`${BASE_URL}/api/pins/${p.pinId}`)

    const analysis = await (await page.request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'Show monthly revenue trend for 2017' },
    })).json()
    await page.request.post(`${BASE_URL}/api/pins`, {
      data: { analysisId: analysis.analysisId, title: 'Monthly Revenue 2017' },
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE_URL}/`)
    await page.locator('button:has-text("Dashboard")').click()
    await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/screenshots/dashboard-pins-1440.png', fullPage: true })
  })

  test('Dashboard with pins at 390px', async ({ page }) => {
    const stalePins = await (await page.request.get(`${BASE_URL}/api/pins`)).json()
    for (const p of stalePins) await page.request.delete(`${BASE_URL}/api/pins/${p.pinId}`)

    const analysis = await (await page.request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'Show monthly revenue trend for 2017' },
    })).json()
    await page.request.post(`${BASE_URL}/api/pins`, {
      data: { analysisId: analysis.analysisId, title: 'Monthly Revenue 2017' },
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE_URL}/`)
    await page.locator('button:has-text("Dashboard")').click()
    await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/screenshots/dashboard-pins-390.png', fullPage: true })
  })

  test('Dashboard with pins at 768px', async ({ page }) => {
    const stalePins = await (await page.request.get(`${BASE_URL}/api/pins`)).json()
    for (const p of stalePins) await page.request.delete(`${BASE_URL}/api/pins/${p.pinId}`)

    const analysis = await (await page.request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'Show monthly revenue trend for 2017' },
    })).json()
    await page.request.post(`${BASE_URL}/api/pins`, {
      data: { analysisId: analysis.analysisId, title: 'Monthly Revenue 2017' },
    })

    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto(`${BASE_URL}/`)
    await page.locator('button:has-text("Dashboard")').click()
    await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'test-results/screenshots/dashboard-pins-768.png', fullPage: true })
  })
})
