import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Drift guard (#97 pattern, issue #169): the tab title is a literal in app.vue,
// while the same string reaches the B24 frame through t('page.index.seo.title')
// in index.vue. Two copies of one string — pin them equal so they can't diverge.
// Pure file read, so it lives in the fast `unit` project, not under Nuxt.
const appVue = readFileSync(fileURLToPath(new URL('../app/app.vue', import.meta.url)), 'utf-8')
const ru = JSON.parse(readFileSync(fileURLToPath(new URL('../i18n/locales/ru.json', import.meta.url)), 'utf-8'))

describe('page title stays in sync with ru.json', () => {
  it('app.vue declares the same title as page.index.seo.title', () => {
    // Tolerant of formatting: optional type annotation, either quote style.
    const declared = appVue.match(/const title\s*(?::\s*string)?\s*=\s*['"](.+?)['"]/)?.[1]
    expect(declared, 'app.vue must declare `const title = ...`').toBeTruthy()
    expect(declared).toBe(ru.page.index.seo.title)
  })
})
