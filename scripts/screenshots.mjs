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
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
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

/** Per-OS relative path to the Chromium binary inside a Playwright browser bundle. */
const BUNDLE_BIN = {
  linux: join('chrome-linux', 'chrome'),
  darwin: join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  win32: join('chrome-win', 'chrome.exe')
}

/**
 * Resolve a Chromium binary. Prefers an explicit env path, then playwright-core's
 * own (cross-platform) resolution — the normal `playwright install chromium` flow
 * on any OS. The PLAYWRIGHT_BROWSERS_PATH fallback is for images that pre-ship
 * Chromium under a different revision (Claude Code / CI sandboxes); it picks the
 * highest revision and maps the binary path per `process.platform`.
 */
function resolveChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH
  try {
    const p = chromium.executablePath()
    if (p && existsSync(p)) return p
  } catch { /* not installed via `playwright install` — fall through */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
  const rel = BUNDLE_BIN[process.platform]
  if (root && rel && existsSync(root)) {
    const dirs = readdirSync(root)
      .filter(d => d.startsWith('chromium-'))
      // Highest revision first — several may coexist after an upgrade.
      .sort((a, b) => Number(b.slice('chromium-'.length)) - Number(a.slice('chromium-'.length)))
    for (const dir of dirs) {
      const candidate = join(root, dir, rel)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined // let playwright try its default and fail loudly if absent
}

async function main() {
  // Start clean so a partial run can't leave stale PNGs mixed with fresh ones.
  rmSync(OUT_DIR, { recursive: true, force: true })
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
          } catch (err) {
            // Only a networkidle timeout is expected (a hanging НБ РБ fetch never
            // goes idle) — the layout is still worth capturing. Any other error
            // (server not started, bad BASE_URL → ERR_CONNECTION_REFUSED) is a
            // real failure: rethrow it instead of saving a blank "success" shot.
            if (err?.name !== 'TimeoutError') throw err
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
