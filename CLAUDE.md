# CLAUDE.md

> Last reviewed: 2026-06-21

Конвертер валют по официальному курсу НБ РБ. Статическое приложение (SSG), без серверной части.

## Стек

- **Nuxt 4** (статическая генерация, `nuxt generate`)
- **Vue 3** — `<script setup lang="ts">`
- **TypeScript** (строгий), **Tailwind CSS v4**, **Bitrix24 UI** (`b24ui`)
- **Vitest** — два проекта: `unit` (node, чистые функции) и `nuxt`
  (`@nuxt/test-utils` + happy-dom, composables и компоненты)

## Команды

```bash
pnpm dev          # дев-сервер
pnpm lint         # ESLint
pnpm typecheck    # vue-tsc --noEmit
pnpm test         # Vitest (оба проекта; быстрый прогон node: pnpm test --project unit)
pnpm generate     # сборка статики (nuxt generate, SSG) — то же гоняют CI и Dockerfile
```

Перед пушем прогоняй `pnpm lint && pnpm typecheck && pnpm test` — это же гоняет CI.

## Архитектура

- `app/pages/index.vue` — экран конвертера (тонкий): разметка строк, прописью, формула;
  логика — в composables ниже.
- `app/components/SiteFooter.vue` — центральные ссылки подвала (НБ РБ, оферта);
  copyright и GitHub-кнопка живут в `app.vue` через слоты `B24Footer`.
- `app/config/currencies.ts` — каталог валют (`DEFAULT_CURRENCIES`, `MAX_AMOUNT`, `DEFAULT_AMOUNT`).
- `app/composables/useNbrbRates.ts` — загрузка курсов (`api.nbrb.by`), кэш в `localStorage`
  (TTL 12 ч, ключ `nbrb_rates_v1`), состояние строк и действия ввода (+/−, пересчёт).
- `app/composables/useCopyFeedback.ts` — копирование в буфер с вспышкой ok/err (Vue-обёртки).
- Тема — нативный colorMode b24ui (`B24ColorModeButton` в шапке, vueuse, ключ `vueuse-color-scheme`).
  Включается в `app/app.config.ts` (`colorMode: true`, `colorModeInitialValue: 'auto'`) — **модуль
  b24ui сам эти top-level ключи в appConfig не кладёт**, без них `useColorMode()` = no-op stub
  (кнопка молча не работает). inline-скрипт `theme-init` в `app.vue` ставит класс до отрисовки (FOUC при SSG).
- `app/utils/converter.ts` — конвертация и адаптивный шаг (чистые функции).
- `app/utils/formatters.ts` — формат чисел (`ru-RU`, decimal), формула `FORMULA_FACTOR = 0.16`,
  `formatPlainAmount` («чистое» число с точкой для буфера) и `quarterOfDate`/`quarterLabel`
  (текущий календарный квартал для блока формулы, напр. «II квартал 2026»).
- `app/utils/numberToWords.ts` — сумма прописью на русском (возвращает **нижний регистр**).
- `app/utils/nbrb.ts` — парсинг ответа НБ РБ (нормализация `Cur_Scale`).
- `app/utils/ratesCache.ts` — валидация/сериализация кэша курсов (чистые функции).
- `app/utils/copyFeedback.ts` — clipboard + флеш-машина + выбор цвета (чистые функции).
- `app/directives/holdRepeat.ts` — автоповтор +/− при удержании.
- `tests/*.test.ts` — Vitest (node) на утилиты, конфиг и директиву.
- `tests/nuxt/**/*.test.ts` — Vitest (проект `nuxt`, `@nuxt/test-utils` + `mountSuspended`)
  на composables (`useNbrbRates`, `useCopyFeedback`), colorMode и страницу `index.vue`; `$fetch`/`localStorage`
  мокаются. Разделение проектов — в `vitest.config.ts` (`defineVitestProject`).

Чистая логика вынесена в `app/utils/*` (+ конфиг) и покрыта тестами; composables — тонкие
Vue-обёртки над ними. Сами composables и `index.vue` покрыты в проекте `nuxt` (см. `tests/nuxt/`).

## Конвенции

- Комментарии и JSDoc — на английском; пользовательский текст и README — на русском.
- Чистые функции — в `app/utils/*` (данные/константы — в `app/config/*`), покрываем тестами;
  реактивную логику — в `app/composables/*`, UI — в компонентах.
- Данные из API рендерим только через `{{ }}` (auto-escape) — никакого `v-html` с внешними данными.
- Пиксельные поправки под b24ui-компоненты — через их `:b24ui`-проп (по `data-slot`) или
  точечный arbitrary-класс (`-ms-[3px]`), с коротким комментарием — что и зачем сдвигаем.
- Штамп ревью: каждый `.md`-документ в корне и `docs/` несёт строку `> Last reviewed: YYYY-MM-DD`
  (ISO-дата) блок-цитатой сразу под заголовком H1. Ключ `Last reviewed` **всегда на английском** —
  это технический маркер (исключение из правила «пользовательский текст — рус.»), чтобы его можно
  было искать одним grep'ом и проверять тестом. Дату бампим **только** при содержательном изменении
  или проверке актуальности сведений — не при косметике (опечатки, формат, переносы). Даты в разных
  файлах независимы (каждый документ пересматривается отдельно). Наличие штампа во всех отслеживаемых
  `.md` проверяет `tests/mdReviewStamp.test.ts`.

## Деплой

GHCR + Watchtower за nginx-proxy. Подробности и «грабли» — в [`docs/AI_DEPLOY_GUIDE.md`](docs/AI_DEPLOY_GUIDE.md),
пользовательская инструкция — в [`README.md`](README.md). Инфраструктурный долг — issue #52.

Прод-образ — `nginxinc/nginx-unprivileged` (non-root, слушает `:8080`). CSP отдаётся
**без** `script-src 'unsafe-inline'`: два inline-скрипта Nuxt в `index.html` (FOUC-гард
`theme-init` и `window.__NUXT__.config` с меняющимся `buildId`) разрешаются по sha256-хэшам,
которые `scripts/csp-hashes.mjs` вычисляет из собранного HTML и подставляет в `nginx.conf`
(плейсхолдер `__CSP_SCRIPT_HASHES__`) на этапе сборки. Яндекс.Метрика грузится из статического
`public/metrika.js` (id — через `<meta>`), поэтому inline-скриптов под неё нет.
</content>
</invoke>
