export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  // Missing translations resolve through the fallback chain quietly. The minimal
  // locale stubs in `i18n/locales/*.json` ship only `app.title` (for B24's
  // LANG_ALL) and the widget's page title; every other key falls back to
  // English, and there is no further chain beyond it.
  silentFallbackWarn: true,
  silentTranslationWarn: true,
  missingWarn: false,
  fallbackWarn: false
}))
