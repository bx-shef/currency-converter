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

// Yandex.Metrika lives in the default (site) layout — NOT app-wide — so it does
// not load on the `clear`-layout pages (/install, /widget/converter) that run
// inside the Bitrix24 portal iframe, where third-party analytics on portal users
// is unwanted. The main page `/` uses this layout too and CAN open as a B24 app
// (dual-mode), so metrika.js additionally self-guards: it bails when embedded in
// an iframe (window.self !== window.top), keeping tracking — and its CSP-blocked
// sync pixels — off the portal. Loaded from a static, CSP-friendly /metrika.js
// (no inline script); the counter id is passed via a <meta> tag and re-validated
// inside metrika.js.
const rawCounterId = String(config.public.yandexCounterId ?? '')
const yandexCounterId = /^\d+$/.test(rawCounterId) ? rawCounterId : ''
if (yandexCounterId) {
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
      <slot />
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
