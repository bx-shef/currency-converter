<script setup lang="ts">
import GitHubIcon from '@bitrix24/b24icons-vue/social/GitHubIcon'
import Bitrix24Icon from '@bitrix24/b24icons-vue/common-service/Bitrix24Icon'

const config = useRuntimeConfig()

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'ru',
    class: 'light'
  }
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

const yandexCounterId = config.public.yandexCounterId as string

if (yandexCounterId) {
  useHead({
    script: [
      {
        id: 'yandex-metrika',
        innerHTML: `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
ym(${yandexCounterId}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true });`,
        type: 'text/javascript'
      }
    ],
    noscript: [
      {
        innerHTML: `<div><img src="https://mc.yandex.ru/watch/${yandexCounterId}" style="position:absolute; left:-9999px;" alt="" /></div>`
      }
    ]
  })
}
</script>

<template>
  <B24App>
    <B24Header>
      <template #left>
        <NuxtLink
          to="/"
          class="text-base font-semibold text-gray-900 no-underline dark:text-white"
        >
          Конвертер валют
        </NuxtLink>
      </template>

      <template #right>
        <B24ColorModeButton :content="{ align: 'end', side: 'bottom' }" />
        <B24Button
          to="https://github.com/bx-shef/currency-converter"
          target="_blank"
          aria-label="GitHub"
          color="air-tertiary-no-accent"
          :icon="GitHubIcon"
          size="sm"
        />
      </template>
    </B24Header>

    <B24Main>
      <NuxtPage />
    </B24Main>

    <B24Separator :icon="Bitrix24Icon" />

    <B24Footer>
      <template #left>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a
            href="https://github.com/bx-shef/currency-converter"
            target="_blank"
            rel="noopener"
            class="text-xs text-gray-500 hover:underline"
          >GitHub</a>
          <a
            href="https://bitrix24.github.io/b24ui/"
            target="_blank"
            rel="noopener"
            class="text-xs text-gray-500 hover:underline"
          >B24UI</a>
          <a
            href="https://bitrix24.github.io/b24jssdk/"
            target="_blank"
            rel="noopener"
            class="text-xs text-gray-500 hover:underline"
          >B24 JS SDK</a>
          <a
            href="https://bitrix24.github.io/b24icons/"
            target="_blank"
            rel="noopener"
            class="text-xs text-gray-500 hover:underline"
          >B24 Icons</a>
          <a
            href="https://apidocs.bitrix24.ru/"
            target="_blank"
            rel="noopener"
            class="text-xs text-gray-500 hover:underline"
          >REST API</a>
        </div>
      </template>
    </B24Footer>
  </B24App>
</template>
