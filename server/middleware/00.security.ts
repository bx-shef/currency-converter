import { APP_PAGES, buildCsp, inlineScriptHashes } from '../lib/security'

// CSP on HTML pages. Every page is rendered by the server (no prerender), so every HTML response passes here.
// The inline-script hashes are taken once from the server's own render of the app pages — the inline
// scripts (theme-init guard, `window.__NUXT__.config`) are the same for every request of one build (checked on
// the built server, docs/MCP.md «Сервер»). The other security headers come from routeRules in nuxt.config.ts.

const INTERNAL_HEADER = 'x-cc-internal'
let csp: Promise<string> | undefined

export default defineEventHandler(async (event) => {
  if (getRequestHeader(event, INTERNAL_HEADER)) return
  const path = event.path.split('?')[0] ?? '/'
  if (path === '/health' || path.startsWith('/api/') || path.startsWith('/_nuxt/') || path.startsWith('/__nuxt') || /\.[a-z0-9]+$/i.test(path)) return
  csp ??= Promise.all(APP_PAGES.map(p => $fetch<string>(p, { headers: { [INTERNAL_HEADER]: '1' }, responseType: 'text' })))
    .then(htmls => buildCsp(inlineScriptHashes(htmls)))
    .catch((e) => {
      csp = undefined
      throw e
    })
  setResponseHeader(event, 'Content-Security-Policy', await csp)
})
