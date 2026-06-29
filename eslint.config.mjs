import withNuxt from './.nuxt/eslint.config.mjs'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'

// `flat/base` registers the plugin + jsonc parser for locale files WITHOUT the
// noisy defaults (e.g. `no-raw-text`, which would flag every hardcoded RU string
// on the RU-only index.vue). We opt into a single rule: the orphan-key guard
// (issue #94) — catches keys defined in ru/en but never referenced via t().
export default withNuxt(
  // Vendored reporting-kit bundle keeps its own conventions and CI — exclude it
  // from our ESLint (today it ships only .md/.sh/.py, but guard future JS too).
  { ignores: ['reporting-kit/**'] },
  ...vueI18n.configs['flat/base'],
  {
    settings: {
      'vue-i18n': {
        localeDir: './i18n/locales/*.json',
        messageSyntaxVersion: '^11.0.0'
      }
    },
    rules: {
      // Caveat: the rule resolves keys statically, so a dynamic key like
      // `t(`page.install.step.${s}.caption`)` would be reported as a false
      // "unused" — add such keys to this rule's `ignores` if that pattern appears.
      '@intlify/vue-i18n/no-unused-keys': ['error', {
        src: './app',
        extensions: ['.ts', '.vue']
      }]
    }
  }
)
