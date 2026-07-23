# CLAUDE.md

> Last reviewed: 2026-07-23

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
pnpm check        # алиас: lint && typecheck && test (прогон перед пушем)
pnpm screenshots  # скриншот-харнесс (роут×вьюпорт×тема) — см. docs/VISUAL_VERIFICATION.md
```

Перед пушем прогоняй `pnpm check` (алиас `lint && typecheck && test`) — те же проверки гоняет CI
(в CI шаги идут отдельными джоб-степами: lint → test → typecheck → generate).

> В web/agent-сессиях Claude Code репозиторий готовит SessionStart-хук
> `.claude/hooks/session-start.sh` (гейт `CLAUDE_CODE_REMOTE`): ставит зависимости и
> гоняет `nuxt prepare`, чтобы lint/typecheck/test работали с первого хода.

## Архитектура

- `app/app.vue` — корень: `useHead`/SEO/`theme-init`, рендерит `<NuxtLayout>`.
- `app/layouts/default.vue` — каркас сайта (шапка с `B24ColorModeButton` и навигацией,
  `B24Footer` с copyright/GitHub и `SiteFooter`) **и Яндекс.Метрика** — здесь, а не в
  `app.vue`, чтобы трекинг не попадал на iframe-страницы Б24 (layout `clear`). Сам `/` тоже
  на этом layout и может открыться как B24-приложение (dual-mode), поэтому `public/metrika.js`
  дополнительно глушит себя в iframe (`window.self !== window.top`) — это держит трекинг и
  его CSP-блокируемые sync-пиксели вне портала. Навигация (левое меню/бургер) ведёт на
  соседний лендинг «Импорт выписки клиент-банка» (`CLIENT_BANK_LANDING_URL` из `utils/site.ts`)
  и на документацию b24ui/b24jssdk/b24icons/REST.
  `app/layouts/clear.vue` — минимальный layout под `/install` и виджет (только `<B24App>`).
- `app/pages/index.vue` — экран конвертера (тонкий): разметка строк, прописью, формула;
  логика — в composables ниже. Внутри B24-фрейма зовёт `parent.setTitle`, затем
  `parent.fitWindow()` и держит фрейм по размеру контента (`ResizeObserver` на корне,
  RAF-коалесинг, teardown в `onBeforeUnmount`) — чтобы у портала был один внешний скролл.
  В мобильном приложении Б24 (`useDevice().isBitrixMobile` из b24ui — детект по
  `BitrixMobile/…` User-Agent) прячет кнопки копирования (в WebView нет Clipboard API).
  Под формулой — одноразовый nudge «Помог курс?» (👍/👎, b24icons `LikeIcon`/`DislikeIcon`):
  клик шлёт цель Метрики `converter_helpful_yes`/`_no` и запоминается в `localStorage`
  (`converter_helpful_v1`), чтобы не спрашивать повторно. Показывается **только standalone**
  (в портале Метрика заглушена → цель бы no-op, поэтому блок скрыт по `isB24`).
  Под калькулятором — промо-блок `<ConverterPromo>` (см. ниже).
- `app/components/ConverterPromo.vue` — **тонкая обёртка**: собирает две вынесенные карточки
  под калькулятором. `<AppInBitrixCard>` — **только standalone** (скрыта в iframe: в портале
  приложение уже стоит) и по признаку `showMarketplace`. `<CustomDevCard>` — всегда.
  Iframe детектится как `isEmbedded = window.self !== window.top` (тот же приём, что у metrika.js).
- `app/components/AppInBitrixCard.vue` — карточка «Приложение для Bitrix24» (light/dark-auto,
  cyan). Контент — **через пропсы** (у каждого приложения свой листинг Маркета); на мобильном —
  кнопка-«отпечаток» `<HoldRevealQr>` (QR листинга). Переносима в `client-bank` (свои тексты).
  URL Маркета конвертера — константа `MARKETPLACE_URL` в `utils/site.ts` (`shef.currencyconverter`),
  переопределяется env `NUXT_PUBLIC_MARKETPLACE_URL`; пустой обеих → карточка скрыта (fail-safe).
  Константа-дефолт нужна, чтобы карточка показывалась без CI-переменной (пустой env иначе обнулил
  бы дефолт runtimeConfig). Клик CTA — цель `market_card_click` (передаётся из `ConverterPromo`
  явно; единое имя цели карточки по экосистеме — ср. hero-ссылку на Маркет в `client-bank`, у
  которой отдельная `market_click`), показ QR — `market_qr_reveal`. Дефолт пропа `clickGoal` в
  компоненте — родовой `market_click` (фолбэк, если карточку встроят без явной цели).
- `app/components/CustomDevCard.vue` — баннер «Нужна доработка под ваш процесс?» (премиальная
  `B24Card variant="filled-copilot"`). **Самодостаточный**: текст и ссылки ИП Шевчик зашиты
  (оффер один на всю экосистему), пропсы — только имена целей. QR (`<HoldRevealQr dark>`) ведёт
  на `offer.bx-shef.by/` (без `#hash`), CTA-клик — на `#brief`. Цели `custom_dev_click`/
  `custom_dev_qr_reveal`. Переносим на **внутренние страницы** `client-bank`.
- `app/components/HoldRevealQr.vue` — переиспользуемая кнопка-«отпечаток» с QR
  (hold-to-reveal, issue #30, паттерн визитки из репо `Lp`): удержание накрывает
  родительскую карточку (`relative overflow-hidden`) оверлеем с QR. Пропсы `url`/`goal`/
  `caption`/`hint`/`dark`/`orientation` (`'row'` — подпись слева, кнопка справа; `'stack'` —
  кнопка сверху, подпись под ней, для модалки-визитки). Акцент — бренд-токен
  `--color-accent-primary-ch`, тон-адаптивный (cyan-600 на светлой карточке, токен на тёмной).
  `qrcode` — **динамический импорт**, генерится **лениво только по удержанию** → на десктопе и
  у тех, кто не трогает кнопку, не грузится. Иконка — inline-SVG (в b24icons 2.0.7 её нет).
  Задуман переносимым в `Lp`/`client-bank`.
- `app/composables/useMetrikaGoal.ts` — обёртка над `ym reachGoal` (тонкая): берёт
  `yandexCounterId` из runtimeConfig и `window.ym`, делегирует в чистое ядро `utils/metrika.ts`
  (`reachMetrikaGoal` — no-op при пустом/невалидном счётчике или незагруженной Метрике; покрыто
  `tests/metrika.test.ts`). Внутри портала Б24 Метрика заглушена (metrika.js) → цели no-op.
- `app/utils/site.ts` — единый источник standalone-контента: экосистемные ссылки
  (`FOOTER_LINKS`, `ECOSYSTEM_TOOLS` — без self-link на сам конвертер), URL соседнего
  проекта (`CLIENT_BANK_LANDING_URL`), опубликованный листинг Маркета (`MARKETPLACE_URL`),
  тексты карточки Маркета (`PROMO_MARKETPLACE` → `<AppInBitrixCard>`; копия custom-dev-карточки
  зашита в `<CustomDevCard>`), резолвер `resolveMarketplaceUrl` (env-override с `.trim()` →
  фолбэк на константу) и предикат `isMarketplaceListing` (показ карточки). Покрыт `tests/site.test.ts`.
- `app/utils/build.ts` — версия сборки для подвала: `shortSha`/`commitUrl` (ссылка «сборка
  &lt;sha&gt;» на точный коммит; sha из `NUXT_PUBLIC_COMMIT_SHA`, в CI — `github.sha`, в dev пусто →
  «сборка dev»). Чистый, покрыт `tests/build.test.ts`.
- `app/components/SiteFooter.vue` — центральный блок подвала (`B24Footer`): источник/партнёр
  (`FOOTER_LINKS`), соседние бесплатные инструменты (`ECOSYSTEM_TOOLS` — **без self-link на
  конвертер**) и ссылка на коммит сборки. Данные — из `utils/site.ts`/`utils/build.ts`.
- `app/config/currencies.ts` — каталог валют (`DEFAULT_CURRENCIES`, `MAX_AMOUNT`, `DEFAULT_AMOUNT`).
- `app/composables/useNbrbRates.ts` — загрузка курсов (`api.nbrb.by`), кэш в `localStorage`
  (TTL 12 ч, ключ `nbrb_rates_v2`), состояние строк и действия ввода (+/−, пересчёт).
  Тянет **два** фида параллельно: дневной (`periodicity=0`, основной) и месячный
  (`periodicity=1`, best-effort — его падение не роняет загрузку). Часть валют НБ РБ
  публикует только помесячно (напр. сербский динар `RSD`), поэтому месячный фид
  мёржится в дневной через `mergeRates` (дневной курс приоритетнее). `ratesDate` берётся
  из дневного фида — месячный курс показывается под этой датой (осознанное упрощение).
  Health-телеметрия: при сбое дневного (основного) фида шлёт цель `rates_load_failed`;
  `rates_monthly_missing` — **только если дневной успешен**, а месячный упал (частичная
  деградация, напр. пустой RSD), чтобы тотальный отказ не слал обе цели. Отправка через
  `reportGoal` в try/catch — сбой телеметрии не может уронить загрузку курсов. Репортер
  инъектируется опцией `onGoal` (тип `RatesHealthGoal`; дефолт `useMetrikaGoal().reachGoal`,
  no-op-safe) как test-seam → тестируемо без `window.ym`. PII: «shape/outcome, never content» —
  шлём факт сбоя, не значения курсов.
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
- `app/utils/nbrb.ts` — парсинг ответа НБ РБ (нормализация `Cur_Scale`) и `mergeRates`
  (слияние дневного и месячного фидов по коду валюты, приоритет у первого).
- `app/utils/ratesCache.ts` — валидация/сериализация кэша курсов (чистые функции).
- `app/utils/copyFeedback.ts` — clipboard + флеш-машина + выбор цвета (чистые функции).
- `app/directives/holdRepeat.ts` — автоповтор +/− при удержании.
- `tests/*.test.ts` — Vitest (node) на утилиты, конфиг и директиву (в т.ч. `build.test.ts` —
  `shortSha`/`commitUrl`; `site.test.ts` — предикат Маркета + инвариант «нет self-link на
  конвертер»; `metrika.test.ts` — чистое ядро целей Метрики).
- `tests/nuxt/**/*.test.ts` — Vitest (проект `nuxt`, `@nuxt/test-utils` + `mountSuspended`)
  на composables (`useNbrbRates`, `useCopyFeedback`), colorMode, страницы `index.vue`,
  `widget/converter.vue` (рендер/ошибка) и вставку в чат (`im:setImTextareaContent`,
  `tests/nuxt/widget-insert.nuxt.test.ts`), а также
  `install.vue` (standalone-редирект на `/` вне фрейма, fake timers). `$fetch`/`localStorage`
  мокаются; B24 — через типизированный `tests/nuxt/helpers/mockB24.ts` (`makeMockB24`,
  типизация `ReturnType<typeof useB24>` ловит дрейф мока). Разделение проектов — в `vitest.config.ts`.

Чистая логика вынесена в `app/utils/*` (+ конфиг) и покрыта тестами; composables — тонкие
Vue-обёртки над ними. Сами composables и `index.vue` покрыты в проекте `nuxt` (см. `tests/nuxt/`).

- `scripts/screenshots.mjs` — dev-харнесс визуальной проверки (`pnpm screenshots`): снимает
  роут × вьюпорт × тема (12 PNG) с предустановленного Chromium через `playwright-core`. **Не в CI**
  (нет baseline/diff — только «глазами свериться»), прод не трогает. Детали — `docs/VISUAL_VERIFICATION.md`.

## Встройка в Bitrix24 (issue #31)

Приложение работает в двух режимах: standalone (обычный сайт) и как iframe-приложение
внутри портала Б24. SDK — `@bitrix24/b24jssdk` (+ `-nuxt`), i18n — `@nuxtjs/i18n`.

- `app/config/b24.ts` — чистые константы встройки (тестируемы без SDK): `B24_REQUIRED_SCOPES`
  (`user_brief, im, placement`) и код плейсмента `IM_TEXTAREA_PLACEMENT` (панель над полем
  ввода чата — единственное место встройки).
- `app/composables/useB24.ts` — обёртка над `B24Frame`: `init()` (идемпотентен; молча no-op вне
  фрейма — когда `window.name` отсутствует; парсинг/handshake делает SDK), `isInit()`, `get()`/
  `getOrThrow()`, `getRequiredRights()` (из `config/b24.ts`), `targetOrigin()`.
- `app/pages/install.vue` (layout `clear`) — обработчик установки: `init → placement.bind`
  `→ installFinish`. Биндит один плейсмент `IM_TEXTAREA` (панель над полем ввода чата) на
  обработчик `/widget/converter`, с чисткой старых привязок (`PLACEMENTS`-цикл). Вне фрейма —
  mock-прогресс с редиректом на `/`. Ошибка показывает retry (с `isRunning`-guard), а не падает.
  `LANG_ALL` — `app.title` на всех языках портала (имя виджета на чип-плейсменте берётся
  отсюда **в момент install** — после смены `app.title` уже установленным порталам нужна
  переустановка приложения, чтобы подхватить новое имя). Биндит только абсолютный HANDLER
  (требует `NUXT_PUBLIC_SITE_URL` в проде).
- `app/pages/widget/converter.vue` (layout `clear`) — компактный конвертер под узкий iframe:
  строки валют как на главной (код + копировать + поле + −/+), сумма прописью BYN/RUB с
  переключателем регистра «аб/Аб». Основное действие «Вставить в чат» шлёт `im:setImTextareaContent`
  (**только прописью**) в поле ввода чата — документированный метод мессенджера
  (apidocs: `iframe-messenger-textarea`). Кнопки рядом копируют суммы/прописью в буфер.
  Адаптивность по `useDevice().isBitrixMobile`: в мобильном приложении контролы крупнее
  (`ctrlSize`); кнопки копирования скрыты (в WebView нет Clipboard API), а «Вставить в чат»
  скрыта пока по фидбэку портала. Раскладка — естественный поток сверху (без `flex-1`-распора),
  чтобы не было дыры над прижатой к низу кнопкой.
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
  `authorUrl`, `commitSha` (коммит сборки — подвал), `marketplaceUrl` (Маркет Б24 — промо-блок)
  — все через build-args (см. Dockerfile/ci). Значения запекаются в SSG-бандл на `generate`,
  поэтому build-arg должен присутствовать до сборки.
- `nginx.conf` — CSP: `frame-ancestors` и `connect-src` разрешают облачные домены Б24
  (`*.bitrix24.*`), иначе iframe-встройка и REST-вызовы install падают. Self-hosted порталы
  на своём домене нужно добавлять туда вручную.

Полную install-flow с реальным `placement.bind`/`installFinish` нельзя проверить автотестами
без портала — визуально через `pnpm dev` (`/install`, `/widget/converter`). Но чистая логика
(`tests/chatMessage.test.ts`, `tests/b24Placements.test.ts`, `tests/b24.test.ts`), вставку
в чат виджетом (`im:setImTextareaContent` — `tests/nuxt/widget-insert.nuxt.test.ts`) и
standalone-ветка install (редирект на `/` вне фрейма, `tests/nuxt/install.nuxt.test.ts`) — покрыты автотестами.

> **После major-бампа `@bitrix24/b24jssdk`** автотесты рантайм SDK не покрывают (в nuxt-тестах
> `useB24` мокается через `makeMockB24`) — обязателен ручной прогон в реальном портале:
> `/install` → bind плейсмента `IM_TEXTAREA` → `/widget/converter` (Insert в поле ввода чата).
> В 2.0 `callBatch`/`callMethod` — deprecated-шим (печатает warning в консоль,
> делегирует в `actions.v2.batch.make`). Батчи install-флоу мигрированы на `actions.v2.batch.make`
> (issue #85) — `callBatch` в коде больше нет; следить, чтобы новый код не возвращал deprecated-вызовы.

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
пользовательская инструкция — в [`README.md`](README.md). Инфраструктурный долг — issue #52
(частично закрыт: SHA-пины сторонних actions в `ci.yml` + `# vX.Y.Z` для Dependabot; таймауты
docker-джоб 30→15 мин; откат `make prod-rollback TAG=sha-<коммит>` через `${APP_IMAGE_TAG}` в
prod-compose + smoke-тест `make prod-smoke` после `prod-redeploy`; healthcheck и пины
watchtower/nginx-proxy/acme-companion уже были). Остаток #52 (brotli/HTTP2, SSH-деплой вместо
Watchtower, digest-пин базовых образов) — по решению владельца.

Прод-образ — `nginxinc/nginx-unprivileged` (non-root, слушает `:8080`). CSP отдаётся
**без** `script-src 'unsafe-inline'`: два inline-скрипта Nuxt в `index.html` (FOUC-гард
`theme-init` и `window.__NUXT__.config` с меняющимся `buildId`) разрешаются по sha256-хэшам,
которые `scripts/csp-hashes.mjs` вычисляет из собранного HTML и подставляет в `nginx.conf`
(плейсхолдер `__CSP_SCRIPT_HASHES__`) на этапе сборки. Яндекс.Метрика грузится из статического
`public/metrika.js` (id — через `<meta>`), поэтому inline-скриптов под неё нет. Dockerfile валит
сборку (в CI-джобе `docker-build`), если плейсхолдер `__CSP_SCRIPT_HASHES__` не подставлен или
`nginx -t` не проходит — ловит битый конфиг/сломанный `csp-hashes.mjs` до старта контейнера.

## Отчётность (reporting-kit)

Вендорный бандл для работы с AI-агентом и отчётов в Telegram лежит в [`reporting-kit/`](reporting-kit/)
(карточка интеграции — [`docs/REPORTING_KIT.md`](docs/REPORTING_KIT.md)). Держим как есть, чтобы
синхронизировать с источником; у него **свои конвенции и свой CI**, поэтому он **не
линтуется** нашими проверками (исключён из `tests/mdReviewStamp.test.ts` и ESLint,
добавлен в `.dockerignore`). Навыки `/report-status`,
`/report-digest`, `/report-questions` и `tg-send.sh` — внутри бандла. Telegram пока не заведён.
