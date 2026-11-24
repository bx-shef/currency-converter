import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { fileURLToPath } from 'node:url'

const alias = {
  '~': fileURLToPath(new URL('./app', import.meta.url))
}

// Two projects (vitest 5): fast `unit` tests in node, and `nuxt` tests
// (composables/components) under a real Nuxt runtime via @nuxt/test-utils.
export default defineConfig(async () => ({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/nuxt/**', 'tests/e2e/**']
        }
      },
      {
        resolve: { alias },
        test: {
          // The built server (.output) end to end — `pnpm build && pnpm test:e2e`; not part of `pnpm test`.
          name: 'e2e',
          environment: 'node',
          include: ['tests/e2e/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000
        }
      },
      await defineVitestProject({
        resolve: { alias },
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          // Stub web-vitals so the client plugin can't register real
          // PerformanceObservers that leak across mounted tests.
          setupFiles: ['./tests/nuxt/setup.ts'],
          // Nuxt cold start + happy-dom can exceed the 5s default on CI.
          // The cold start itself happens in @nuxt/test-utils' beforeAll
          // (setupNuxt), governed by hookTimeout — without raising it too,
          // suites flake with "Hook timed out in 10000ms" on a cold cache.
          testTimeout: 30_000,
          hookTimeout: 60_000
        }
      })
    ]
  }
}))
