# CLAUDE.md

> Last reviewed: 2026-06-29

Конвертер валют по официальному курсу НБ РБ. Статическое приложение (SSG), без серверной части.

## Стек

- **Nuxt 4** (статическая генерация, `nuxt generate`)
- **Vue 3** — `<script setup lang="ts">`
- **TypeScript** (строгий), **Tailwind CSS v4**, **Bitrix24 UI** (`b24ui`)
- **Bitrix24 JS SDK** (`@bitrix24/b24jssdk`) — встройка в портал (issue #31), **i18n** (`@nuxtjs/i18n`)
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

- `app/app.vue` — корень: `useHead`/SEO/`theme-init`, рендерит `<NuxtLayout>`.
- `app/layouts/default.vue` — каркас сайта (шапка с `B24ColorModeButton` и навигацией,
  `B24Footer` с copyright/GitHub и `SiteFooter`) **и Яндекс.Метрика** — здесь, а не в
  `app.vue`, чтобы трекинг не попадал на iframe-страницы Б24 (layout `clear`).
  `app/layouts/clear.vue` — минимальный layout под `/install` и виджет (только `<B24App>`).
- `app/pages/index.vue` — экран конвертера (тонкий): разметка строк, прописью, формула;
  логика — в composables ниже. Внутри B24-фрейма зовёт `parent.setTitle`.
- `app/components/SiteFooter.vue` — центральные ссылки подвала (НБ РБ, оферта) для слота `B24Footer`.
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
  на composables (`useNbrbRates`, `useCopyFeedback`), colorMode, страницы `index.vue`,
  `widget/converter.vue` (рендер/ошибка и детект плейсмента Copy↔Insert, issue #89) и
  `install.vue` (standalone-редирект на `/` вне фрейма, fake timers). `$fetch`/`localStorage`
  мокаются; B24 — через типизированный `tests/nuxt/helpers/mockB24.ts` (`makeMockB24`,
  типизация `ReturnType<typeof useB24>` ловит дрейф мока). Разделение проектов — в `vitest.config.ts`.

Чистая логика вынесена в `app/utils/*` (+ конфиг) и покрыта тестами; composables — тонкие
Vue-обёртки над ними. Сами composables и `index.vue` покрыты в проекте `nuxt` (см. `tests/nuxt/`).

## Встройка в Bitrix24 (issue #31)

Приложение работает в двух режимах: standalone (обычный сайт) и как iframe-приложение
внутри портала Б24. SDK — `@bitrix24/b24jssdk` (+ `-nuxt`), i18n — `@nuxtjs/i18n`.

- `app/config/b24.ts` — чистые константы встройки (тестируемы без SDK): `B24_REQUIRED_SCOPES`
  (`user_brief, im, placement, mobile`) и коды плейсментов `IM_TEXTAREA_PLACEMENT`,
  `IMMOBILE_CONTEXT_MENU_PLACEMENT`.
- `app/composables/useB24.ts` — обёртка над `B24Frame`: `init()` (идемпотентен; молча no-op вне
  фрейма — когда `window.name` отсутствует; парсинг/handshake делает SDK), `isInit()`, `get()`/
  `getOrThrow()`, `getRequiredRights()` (из `config/b24.ts`), `targetOrigin()`.
- `app/pages/install.vue` (layout `clear`) — обработчик установки: `init → placement.bind`
  `→ installFinish`. Биндит **два** места: `IM_TEXTAREA` (панель чата, веб) и
  `IMMOBILE_CONTEXT_MENU` (мобильное контекстное меню сообщения, issue #89) — оба на один
  обработчик `/widget/converter`, с чисткой старых привязок (`PLACEMENTS`-цикл). Вне фрейма —
  mock-прогресс с редиректом на `/`. Ошибка показывает retry (с `isRunning`-guard), а не падает.
  `LANG_ALL` — `app.title` на всех языках портала (имя виджета на чип-плейсменте берётся
  отсюда **в момент install** — после смены `app.title` уже установленным порталам нужна
  переустановка приложения, чтобы подхватить новое имя). Биндит только абсолютный HANDLER
  (требует `NUXT_PUBLIC_SITE_URL` в проде).
- `app/pages/widget/converter.vue` (layout `clear`) — компактный конвертер под узкий iframe:
  строки валют как на главной (код + копировать + поле + −/+), сумма прописью BYN/RUB с
  переключателем регистра «аб/Аб». Основное действие «Вставить в чат» шлёт `im:setImTextareaContent`
  (**только прописью**) — для **обоих** плейсментов (десктоп и мобильное меню). Кнопки копирования
  в буфер — только на десктопе (`IM_TEXTAREA`): в мобильном WebView нет Clipboard API (issue #89).
- `app/utils/chatMessage.ts` — чистый `buildWordsLines` (строки «прописью» BYN/RUB для вставки; покрыт тестами).
- `i18n/` — список локалей в `i18n/i18n.ts` (зеркалит языки Б24), конфиг в `i18n/i18n.config.ts`,
  переводы `i18n/locales/<code>.json` (полные `ru`/`en`, прочие — фолбэк на `en` + свой `app.title`).
  Осиротевшие ключи (в `ru`/`en`, но не используемые через `t()`) ловит ESLint-правило
  `@intlify/vue-i18n/no-unused-keys` (в `eslint.config.mjs`, только оно — без шумного `no-raw-text`).
  Паритет ключей `ru`↔`en` (чтобы не «добавил в `ru`, забыл в `en`») и наличие `app.title`
  во всех локалях (нужен для `LANG_ALL` у `placement.bind`) проверяет
  `tests/i18nLocaleParity.test.ts` — ортогонально `no-unused-keys` (то ловит неиспользуемые
  ключи, этот — пропущенные в одной из полных локалей). А `tests/i18nUsedKeys.test.ts` ловит
  обратное слепое пятно: ключ, используемый в коде через `t()`, но отсутствующий в `en` (опечатка/
  удаление из обеих локалей) — собирает все статические `t('...')` из `app/` и сверяет с `en.json`.
- `nuxt.config.ts` — `nitro.prerender.routes` явно перечисляет `/install` и `/widget/converter`
  (на них нет ссылок, иначе краулер их пропустит). `runtimeConfig.public`: `siteUrl`, `authorName`,
  `authorUrl` (через build-args, см. Dockerfile/ci).
- `nginx.conf` — CSP: `frame-ancestors` и `connect-src` разрешают облачные домены Б24
  (`*.bitrix24.*`), иначе iframe-встройка и REST-вызовы install падают. Self-hosted порталы
  на своём домене нужно добавлять туда вручную.

Полную install-flow с реальным `placement.bind`/`installFinish` нельзя проверить автотестами
без портала — визуально через `pnpm dev` (`/install`, `/widget/converter`). Но чистая логика
(`tests/chatMessage.test.ts`, `tests/b24Placements.test.ts`, `tests/b24.test.ts`), поведение
виджета по плейсменту (копирование только на десктопе, вставка на обоих — `tests/nuxt/widget-placement.nuxt.test.ts`) и standalone-ветка
install (редирект на `/` вне фрейма, `tests/nuxt/install.nuxt.test.ts`) — покрыты автотестами.

> **После major-бампа `@bitrix24/b24jssdk`** автотесты рантайм SDK не покрывают (в nuxt-тестах
> `useB24` мокается через `makeMockB24`) — обязателен ручной прогон в реальном портале:
> `/install` → bind двух плейсментов → `/widget/converter` (Insert на десктопе, Copy в мобильном
> контекстном меню). В 2.0 `callBatch`/`callMethod` — deprecated-шим (печатает warning в консоль,
> делегирует в `actions.v2.batch.make`); миграция на `actions.v2` — issue #85, до следующего major.

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
