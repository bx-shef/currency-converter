import { buildCsp, inlineScriptHashes } from '../lib/security'

// CSP of every server-rendered HTML response, with the sha256 of the inline scripts of THAT response (theme-init
// guard, `window.__NUXT__.config`, error page scripts…). Computed from the very bytes being sent, so the policy
// always matches the page — no shared cache, no internal requests. The other security headers come from
// routeRules in nuxt.config.ts.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response) => {
    if (typeof response.body !== 'string') return
    response.headers = { ...response.headers, 'content-security-policy': buildCsp(inlineScriptHashes([response.body])) }
  })
})
