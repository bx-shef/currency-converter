<template>
  <div class="flex flex-col gap-2 text-xs text-gray-500 dark:text-white/55">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span>© {{ new Date().getFullYear() }} ИП Шевчик И. С</span>
      <a
        href="https://api.nbrb.by"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:underline dark:hover:text-white"
      >api.nbrb.by</a>
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <a
        href="https://offer.bx-shef.by/"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:underline dark:hover:text-white"
      >offer.bx-shef.by</a>
      <a
        href="https://github.com/bx-shef/currency-converter"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:underline dark:hover:text-white"
      >GitHub</a>
    </div>
  </div>
</template>
