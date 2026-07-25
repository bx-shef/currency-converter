/**
 * Builds the `LANG_ALL` map for Bitrix24's `placement.bind`: the widget TITLE per
 * locale the portal ships. Extracted from `install.vue` as a pure function with an
 * injected translate fn so it is unit-testable without a Nuxt/i18n runtime (#86).
 *
 * The name shown on the chat chip is read at install time, so the map must cover
 * every locale — a missing or broken per-locale resolution must NOT abort the whole
 * bind, or the widget would fail to install; such a locale falls back to the
 * current-locale title instead.
 */

/** The minimal shape of vue-i18n's `t` that {@link buildLangAll} needs. */
export type TitleTranslate = (
  key: string,
  named?: Record<string, unknown>,
  options?: { locale: string }
) => string

export function buildLangAll(
  locales: readonly { code: string }[],
  currentLocale: string,
  t: TitleTranslate
): Record<string, { TITLE: string }> {
  // Resolve the active locale once; it's also the fallback for any locale that throws.
  const fallbackTitle = t('app.title')
  const out: Record<string, { TITLE: string }> = {}
  for (const loc of locales) {
    let title: string
    try {
      title = loc.code === currentLocale
        ? fallbackTitle
        : t('app.title', {}, { locale: loc.code })
    } catch {
      title = fallbackTitle
    }
    out[loc.code] = { TITLE: title }
  }
  return out
}
