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
      authorUrl: 'https://bx-shef.by'
    }
  },

  // `/` is dynamic now (i18n + B24 detection), so the previous prerender hint
  // is removed — Nitro renders it at request time.

  compatibilityDate: '2025-01-15',

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
