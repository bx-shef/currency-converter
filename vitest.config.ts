import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { fileURLToPath } from 'node:url'

const alias = {
  '~': fileURLToPath(new URL('./app', import.meta.url))
}

// Two projects (vitest 4): fast `unit` tests in node, and `nuxt` tests
// (composables/components) under a real Nuxt runtime via @nuxt/test-utils.
export default defineConfig(async () => ({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/nuxt/**']
        }
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts']
        }
      })
    ]
  }
}))
