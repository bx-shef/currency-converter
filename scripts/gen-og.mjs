// Renders scripts/og.svg → public/og.png (1200×630) via the pre-installed
// Chromium (playwright-core). This lets the Docker builder drop the heavy
// `inkscape` system dependency (issue #81) — the PNG is committed to the repo and
// regenerated only when the design changes:
//
//   node scripts/gen-og.mjs        (alias: pnpm og:snapshot)
//
// Chromium renders with the same DejaVu Sans the SVG asks for, so the output
// matches the previous inkscape render (both use font-dejavu / DejaVu Sans).
// NOTE: regenerate on a machine that has DejaVu Sans installed (fc-list | grep
// -i dejavu) — otherwise Chromium silently substitutes another font and the
// Cyrillic title drifts from the committed image.
import { chromium } from 'playwright-core'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUNDLE_BIN = {
  linux: join('chrome-linux', 'chrome'),
  darwin: join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
  win32: join('chrome-win', 'chrome.exe')
}

/** Resolve a Chromium binary (mirrors scripts/screenshots.mjs). */
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
      .sort((a, b) => Number(b.slice('chromium-'.length)) - Number(a.slice('chromium-'.length)))
    for (const dir of dirs) {
      const candidate = join(root, dir, rel)
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

async function main() {
  const svg = readFileSync(fileURLToPath(new URL('./og.svg', import.meta.url)), 'utf-8')
  const out = fileURLToPath(new URL('../public/og.png', import.meta.url))
  const browser = await chromium.launch({ executablePath: resolveChromium() })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
    // margin:0 so the 1200×630 SVG fills the viewport exactly, top-left aligned.
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style>${svg}`,
      { waitUntil: 'networkidle' }
    )
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } })
    console.log(`og: wrote ${out}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('og generation failed:', err.message)
  process.exit(1)
})
