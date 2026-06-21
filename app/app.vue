<script setup lang="ts">
const config = useRuntimeConfig()

// b24ui colorMode persists the choice under this @vueuse/core key; the inline
// theme-init script below reads it to set the class before paint. Keep in sync
// with b24ui's `colorModeStorageKey` default.
const COLOR_MODE_STORAGE_KEY = 'vueuse-color-scheme'

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
      innerHTML: `(function(){try{var s=localStorage.getItem("${COLOR_MODE_STORAGE_KEY}")||"auto";if(s==="auto"){s=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var d=s!=="light";var c=document.documentElement.classList;c.toggle("dark",d);c.toggle("light",!d);}catch(e){}})();`
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

const rawCounterId = String(config.public.yandexCounterId ?? '')
// Accept only numeric IDs (defence in depth; also re-checked inside metrika.js).
const yandexCounterId = /^\d+$/.test(rawCounterId) ? rawCounterId : ''

if (yandexCounterId) {
  // Metrika is bootstrapped from a static, CSP-friendly external file
  // (`public/metrika.js`, served from 'self') instead of an inline script, so
  // the CSP needs no `'unsafe-inline'` for scripts. The counter id is passed via
  // a <meta> tag (HTML, not executable) and re-validated inside metrika.js.
  useHead({
    meta: [
      { name: 'yandex-metrika-id', content: yandexCounterId }
    ],
    script: [
      { key: 'yandex-metrika', src: '/metrika.js', defer: true }
    ],
    noscript: [
      {
        // No script execution here — just a tracking pixel; counter id is digit-only.
        innerHTML: `<div><img src="https://mc.yandex.ru/watch/${yandexCounterId}" style="position:absolute; left:-9999px;" alt="" /></div>`
      }
    ]
  })
}
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
