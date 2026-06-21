export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  // Missing translations resolve through the fallback chain quietly. The minimal
  // locale stubs in `i18n/locales/*.json` only ship `app.title` for B24's
  // LANG_ALL; every other key falls back to English (and English to Russian).
  silentFallbackWarn: true,
  silentTranslationWarn: true,
  missingWarn: false,
  fallbackWarn: false
}))
