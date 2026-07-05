import { contentLocales } from './i18n/i18n'

const allowedHosts = process.env.NUXT_ALLOWED_HOSTS
  ? process.env.NUXT_ALLOWED_HOSTS.split(',').map((h: string) => h.trim())
  : []

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@bitrix24/b24ui-nuxt',
    '@bitrix24/b24jssdk-nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/i18n'
  ],

  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      yandexCounterId: '',
      // Public URL where this app is hosted. Used by the Bitrix24 install
      // handler to compose the placement HANDLER. Override via NUXT_PUBLIC_SITE_URL.
      siteUrl: '',
      // Author shown in the IM_TEXTAREA widget footer.
      authorName: 'bx-shef',
      authorUrl: 'https://bx-shef.by',
      // Git commit the build came from — shown in the footer as a link to the
      // exact commit. CI passes ${{ github.sha }}; empty in dev.
      commitSha: '',
      // Optional override for the «app in Bitrix24» card URL. Default (empty
      // here) → the promo falls back to the published `MARKETPLACE_URL` constant
      // in `app/utils/site.ts`; set NUXT_PUBLIC_MARKETPLACE_URL to point at a
      // different listing (e.g. regional) without a code change.
      marketplaceUrl: ''
    }
  },

  compatibilityDate: '2025-01-15',

  // `/install` and `/widget/converter` are loaded directly by Bitrix24 in an
  // iframe and are not linked from `/`, so the generate crawler would skip them.
  // List them explicitly so `nuxt generate` emits real HTML for each. Client-side
  // B24 detection + i18n still run at hydration on top of the prerendered HTML.
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/install', '/widget/converter']
    }
  },

  vite: {
    server: {
      allowedHosts,
      cors: true
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'ru',
    locales: contentLocales,
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
      fallbackLocale: 'ru'
    },
    vueI18n: './i18n.config.ts'
  }
})
