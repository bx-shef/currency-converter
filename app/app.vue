<script setup lang="ts">
import { THEME_INIT_SCRIPT } from '~/utils/themeInit'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#030022' },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' }
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'preconnect', href: 'https://api.nbrb.by' }
  ],
  htmlAttrs: {
    // No static theme class here: b24ui colorMode owns `dark`/`light` on the
    // client; the theme-init script below applies it before first paint.
    lang: 'ru'
  },
  script: [
    {
      // FOUC guard for SSG: b24ui colorMode (vueuse) sets the class only on the
      // client, so we apply the stored/OS theme before first paint. Defaults to
      // `auto` (OS) when nothing is stored. Only dark/light/auto occur via the
      // toggle, so anything non-"light" is treated as dark.
      key: 'theme-init',
      tagPosition: 'head',
      tagPriority: 'critical',
      innerHTML: THEME_INIT_SCRIPT
    }
  ]
})

const title = 'Конвертер валют НБ РБ'
const description = 'Официальный курс Национального банка Республики Беларусь. Конвертируйте USD, EUR, RUB, CNY, TRY и другие валюты.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogImage: '/og.png',
  ogType: 'website',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
