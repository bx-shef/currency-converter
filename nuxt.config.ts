const allowedHosts = process.env.NUXT_ALLOWED_HOSTS
  ? process.env.NUXT_ALLOWED_HOSTS.split(',').map((h: string) => h.trim())
  : []

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@bitrix24/b24ui-nuxt', 'nuxt-og-image'],

  site: {
    url: process.env.NUXT_SITE_URL || '',
    name: 'Конвертер валют НБ РБ'
  },

  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/': { prerender: true }
  },

  compatibilityDate: '2025-01-15',

  runtimeConfig: {
    public: {
      yandexCounterId: ''
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
  }
})
