<script setup lang="ts">
import { ru } from '@bitrix24/b24ui-nuxt/locale'
import GitHubIcon from '@bitrix24/b24icons-vue/social/GitHubIcon'
import Bitrix24Icon from '@bitrix24/b24icons-vue/common-service/Bitrix24Icon'
import OpenBookIcon from '@bitrix24/b24icons-vue/main/OpenBookIcon'
import ThemeIcon from '@bitrix24/b24icons-vue/outline/ThemeIcon'
import CodeIcon from '@bitrix24/b24icons-vue/common-service/CodeIcon'
import AppsIcon from '@bitrix24/b24icons-vue/solid/AppsIcon'
import DeveloperResourcesIcon from '@bitrix24/b24icons-vue/solid/DeveloperResourcesIcon'

const config = useRuntimeConfig()

// Copyright year — resolved once on the server and serialized via useState, so
// the client hydrates the same value (no mismatch if the year rolls over while
// a prebuilt SSG page is served). Refreshes on the next build.
const currentYear = useState('currentYear', () => new Date().getFullYear())

// b24ui colorMode persists the choice under this @vueuse/core key; the inline
// theme-init script below reads it to set the class before paint. Keep in sync
// with b24ui's `colorModeStorageKey` default.
const COLOR_MODE_STORAGE_KEY = 'vueuse-color-scheme'

const navItems = [
  [
    {
      label: 'Документация',
      icon: OpenBookIcon,
      children: [
        { label: 'b24ui', icon: ThemeIcon, to: 'https://bitrix24.github.io/b24ui/', target: '_blank' },
        { label: 'b24jssdk', icon: CodeIcon, to: 'https://bitrix24.github.io/b24jssdk/', target: '_blank' },
        { label: 'b24icons', icon: AppsIcon, to: 'https://bitrix24.github.io/b24icons/', target: '_blank' },
        { label: 'REST API', icon: DeveloperResourcesIcon, to: 'https://apidocs.bitrix24.ru/', target: '_blank' }
      ]
    }
  ]
]

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
  <B24App :locale="ru">
    <!-- toggle = B24Header's burger button (data-slot="toggle"); nudge it 3px toward the edge -->
    <B24Header :b24ui="{ toggle: '-ms-[3px]' }">
      <template #left>
        <NuxtLink
          to="/"
          class="text-base font-semibold text-gray-900 no-underline dark:text-white"
        >
          Конвертер валют
        </NuxtLink>
      </template>

      <B24NavigationMenu :items="navItems" />

      <template #right>
        <!-- me-[3px]: nudge the rightmost header control off the edge (as the GitHub button was) -->
        <B24ColorModeButton
          size="sm"
          class="me-[3px]"
        />
      </template>

      <template #body>
        <B24NavigationMenu
          :items="navItems"
          orientation="vertical"
        />
      </template>
    </B24Header>

    <B24Main>
      <noscript>
        <p class="p-4 text-center text-sm text-gray-500">
        Для работы конвертера необходимо включить JavaScript.
        </p>
      </noscript>
      <NuxtPage />
    </B24Main>

    <B24Separator :icon="Bitrix24Icon" />

    <B24Footer>
      <template #left>
        <span class="text-xs text-gray-500 dark:text-white/55">© {{ currentYear }} ИП Шевчик И. С</span>
      </template>

      <SiteFooter />

      <template #right>
        <B24Button
          :icon="GitHubIcon"
          to="https://github.com/bx-shef/currency-converter"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          color="air-tertiary-no-accent"
          size="sm"
        />
      </template>
    </B24Footer>
  </B24App>
</template>
