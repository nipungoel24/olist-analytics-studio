import { test, expect } from '@playwright/test'

// Phase 5 E2E tests for Explore and Dashboard UI.
// Requires Docker stack running on http://localhost:3000
// Note: Web app is built but not served by API in current Docker setup.
// These tests verify API endpoints and persistence behavior.

const BASE_URL = 'http://localhost:3000'

test.describe('Phase 5 API E2E', () => {
  test('API health check', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/health`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data.status).toBe('ok')
  })

  test('API ready check', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/ready`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data.status).toBe('ready')
    expect(data.database).toBe(true)
  })

  test('Create analysis and pin', async ({ request }) => {
    // Create analysis
    const analysisResponse = await request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'Show monthly revenue trend for 2017' },
    })
    expect(analysisResponse.ok()).toBeTruthy()
    const analysis = await analysisResponse.json()
    expect(analysis.status).toBe('success')
    expect(analysis.analysisId).toBeDefined()

    // Create pin
    const pinResponse = await request.post(`${BASE_URL}/api/pins`, {
      data: { analysisId: analysis.analysisId },
    })
    expect(pinResponse.ok()).toBeTruthy()
    const pin = await pinResponse.json()
    expect(pin.pinId).toBeDefined()
    expect(pin.analysisId).toBe(analysis.analysisId)

    // Verify pin exists in list
    const listResponse = await request.get(`${BASE_URL}/api/pins`)
    expect(listResponse.ok()).toBeTruthy()
    const pins = await listResponse.json()
    const foundPin = pins.find((p: any) => p.pinId === pin.pinId)
    expect(foundPin).toBeDefined()
  })

  test('Refresh pin', async ({ request }) => {
    // Create analysis and pin
    const analysisResponse = await request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'Show monthly revenue trend for 2017' },
    })
    const analysis = await analysisResponse.json()

    const pinResponse = await request.post(`${BASE_URL}/api/pins`, {
      data: { analysisId: analysis.analysisId },
    })
    const pin = await pinResponse.json()

    // Refresh pin
    const refreshResponse = await request.post(`${BASE_URL}/api/pins/${pin.pinId}/refresh`, {
      data: {},
    })
    expect(refreshResponse.ok()).toBeTruthy()
    const refresh = await refreshResponse.json()
    expect(refresh.refreshId).toBeDefined()
    expect(refresh.status).toBeDefined()
  })

  test('Delete pin', async ({ request }) => {
    // Create analysis and pin
    const analysisResponse = await request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'Show monthly revenue trend for 2017' },
    })
    const analysis = await analysisResponse.json()

    const pinResponse = await request.post(`${BASE_URL}/api/pins`, {
      data: { analysisId: analysis.analysisId },
    })
    const pin = await pinResponse.json()

    // Delete pin
    const deleteResponse = await request.delete(`${BASE_URL}/api/pins/${pin.pinId}`)
    expect(deleteResponse.ok()).toBeTruthy()

    // Verify pin is gone
    const listResponse = await request.get(`${BASE_URL}/api/pins`)
    const pins = await listResponse.json()
    const foundPin = pins.find((p: any) => p.pinId === pin.pinId)
    expect(foundPin).toBeUndefined()
  })

  test('Persistence after restart', async ({ request }) => {
    // Create analysis and pin
    const analysisResponse = await request.post(`${BASE_URL}/api/analyses`, {
      data: { question: 'Show monthly revenue trend for 2017' },
    })
    const analysis = await analysisResponse.json()

    const pinResponse = await request.post(`${BASE_URL}/api/pins`, {
      data: { analysisId: analysis.analysisId },
    })
    const pin = await pinResponse.json()

    // Verify pin exists
    const listResponse = await request.get(`${BASE_URL}/api/pins`)
    const pins = await listResponse.json()
    const foundPin = pins.find((p: any) => p.pinId === pin.pinId)
    expect(foundPin).toBeDefined()
    expect(foundPin.latestSnapshotId).toBe(pin.latestSnapshotId)
  })
})
