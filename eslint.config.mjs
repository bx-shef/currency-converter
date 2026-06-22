import withNuxt from './.nuxt/eslint.config.mjs'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'

// `flat/base` registers the plugin + jsonc parser for locale files WITHOUT the
// noisy defaults (e.g. `no-raw-text`, which would flag every hardcoded RU string
// on the RU-only index.vue). We opt into a single rule: the orphan-key guard
// (issue #94) — catches keys defined in ru/en but never referenced via t().
export default withNuxt(
  ...vueI18n.configs['flat/base'],
  {
    settings: {
      'vue-i18n': {
        localeDir: './i18n/locales/*.json',
        messageSyntaxVersion: '^11.0.0'
      }
    },
    rules: {
      '@intlify/vue-i18n/no-unused-keys': ['error', {
        src: './app',
        extensions: ['.ts', '.vue']
      }]
    }
  }
)
