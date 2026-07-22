// Visual-verification harness: screenshots every route across viewport × theme
// so a UI change can be eyeballed in light/dark on mobile and desktop.
//
// Server and shooter are intentionally separate (robust + cross-platform): start
// the app first, then run this. See docs/VISUAL_VERIFICATION.md.
//   pnpm generate && pnpm preview        # terminal 1 (serves http://localhost:3000)
//   pnpm screenshots                     # terminal 2 (writes screenshots/*.png)
//
// Env overrides: BASE_URL (default http://localhost:3000),
//   PLAYWRIGHT_CHROMIUM_PATH (explicit Chromium binary).
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT_DIR = fileURLToPath(new URL('../screenshots/', import.meta.url))

/** Routes worth eyeballing — the two iframe pages have no inbound links. */
const ROUTES = [
  { path: '/', slug: 'index' },
  { path: '/widget/converter', slug: 'widget-converter' },
  { path: '/install', slug: 'install' }
]
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 }
]
const THEMES = /** @type {const} */ (['light', 'dark'])

/**
 * Resolve a Chromium binary. Prefers an explicit env path, then playwright-core's
 * own resolution, then the browser bundle under PLAYWRIGHT_BROWSERS_PATH (the
 * Claude Code / CI image ships Chromium there under a possibly different revision).
 */
function resolveChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH
  try {
    const p = chromium.executablePath()
    if (p && existsSync(p)) return p
  } catch { /* not installed via `playwright install` — fall through */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (root && existsSync(root)) {
    const dir = readdirSync(root).find(d => d.startsWith('chromium-'))
    if (dir) {
      const candidate = join(root, dir, 'chrome-linux', 'chrome')
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined // let playwright try its default and fail loudly if absent
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const executablePath = resolveChromium()
  const browser = await chromium.launch({ executablePath })
  let shot = 0
  try {
    for (const theme of THEMES) {
      for (const vp of VIEWPORTS) {
        // colorScheme drives the app's `auto` colorMode via prefers-color-scheme,
        // so no localStorage injection is needed to force light/dark.
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: theme,
          deviceScaleFactor: 2
        })
        for (const route of ROUTES) {
          const page = await context.newPage()
          const url = BASE_URL + route.path
          try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 })
          } catch {
            // networkidle can time out if the live НБ РБ fetch hangs; the layout
            // is still worth capturing, so fall back to a plain load wait.
            await page.waitForLoadState('load').catch(() => {})
          }
          const file = join(OUT_DIR, `${route.slug}-${vp.name}-${theme}.png`)
          await page.screenshot({ path: file, fullPage: true })
          shot++
          console.log(`✓ ${route.slug} ${vp.name} ${theme}`)
          await page.close()
        }
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
  console.log(`\n${shot} screenshots → ${OUT_DIR}`)
}

main().catch((err) => {
  console.error('screenshots failed:', err?.message ?? err)
  process.exit(1)
})
