import { allowedInlineScriptHashes, buildCsp } from '../lib/security'

// CSP of every server-rendered HTML response, with the sha256 of the KNOWN inline scripts of THAT response
// (theme-init guard, Nuxt importmap, `window.__NUXT__.config`, the 404 «back» script — allowedInlineScriptHashes).
// Anything else inline — e.g. a script injected into the markup — gets no hash and stays blocked. The other security headers come from
// routeRules in nuxt.config.ts.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response) => {
    if (typeof response.body !== 'string') return
    response.headers = { ...response.headers, 'content-security-policy': buildCsp(allowedInlineScriptHashes(response.body)) }
  })
})
