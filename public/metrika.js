/*
 * Yandex.Metrika bootstrap, loaded as a static same-origin script so the page CSP
 * does not need `script-src 'unsafe-inline'`. The counter id is read from the
 * `<meta name="yandex-metrika-id">` tag emitted by app.vue and re-validated here.
 * Does nothing when the meta tag is absent or the id is not numeric.
 */
(function () {
  // Skip analytics when embedded in an iframe — notably the Bitrix24 portal,
  // where the app's dual-mode main page (`/`) opens as a B24 app. Tracking
  // portal users is unwanted by design (see app/layouts/default.vue), and
  // Metrika's cross-origin sync pixels (yandex.ru/an/*) are blocked by our CSP,
  // spamming the console. Comparing window.self/top is safe cross-origin.
  try { if (window.self !== window.top) return } catch (e) { return }

  var meta = document.querySelector('meta[name="yandex-metrika-id"]')
  var id = meta && meta.getAttribute('content')
  if (!id || !/^\d+$/.test(id)) return

  ;(function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments) }
    m[i].l = 1 * new Date()
    for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) { return } }
    k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r
    a.parentNode.insertBefore(k, a)
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym')

  window.ym(Number(id), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true })
})()
