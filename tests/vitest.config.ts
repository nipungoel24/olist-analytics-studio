import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    include: ['integration/**/*.test.ts'],
    exclude: ['**/e2e/**', '**/node_modules/**'],
  },
})
