<script setup lang="ts">
import { FOOTER_LINKS, ECOSYSTEM_TOOLS } from '~/utils/site'
import { shortSha, commitUrl } from '~/utils/build'

// Center block for B24Footer: data-source / partner links, sibling free tools
// (no self-link to the converter — this IS it), and a link to the exact build
// commit. Hover: blue in light theme, white in dark.
const { public: { commitSha } } = useRuntimeConfig()

const sha = computed(() => shortSha(commitSha as string))
const shaHref = computed(() => commitUrl(commitSha as string))
</script>

<template>
  <div class="flex flex-col items-center gap-1.5 text-xs text-gray-500 dark:text-white/55">
    <nav class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      <a
        v-for="link in FOOTER_LINKS"
        :key="link.id"
        :href="link.href"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-blue-600 hover:underline dark:hover:text-white"
      >{{ link.label }}</a>
      <a
        v-for="tool in ECOSYSTEM_TOOLS"
        :key="tool.id"
        :href="tool.href"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-blue-600 hover:underline dark:hover:text-white"
      >{{ tool.label }}</a>
    </nav>
    <a
      :href="shaHref"
      target="_blank"
      rel="noopener noreferrer"
      class="font-mono text-[11px] text-gray-400 hover:text-blue-600 hover:underline dark:text-white/40 dark:hover:text-white"
    >сборка {{ sha || 'dev' }}</a>
  </div>
</template>
