# CLAUDE.md

Конвертер валют по официальному курсу НБ РБ. Статическое приложение (SSG), без серверной части.

## Стек

- **Nuxt 4** (статическая генерация, `nuxt generate`)
- **Vue 3** — `<script setup lang="ts">`
- **TypeScript** (строгий), **Tailwind CSS v4**, **Bitrix24 UI** (`b24ui`)
- **Vitest** — юнит-тесты (окружение `node`)

## Команды

```bash
pnpm dev          # дев-сервер
pnpm lint         # ESLint
pnpm typecheck    # vue-tsc --noEmit
pnpm test         # Vitest
pnpm generate     # сборка статики (nuxt generate, SSG) — то же гоняют CI и Dockerfile
```

Перед пушем прогоняй `pnpm lint && pnpm typecheck && pnpm test` — это же гоняет CI.

## Архитектура

- `app/pages/index.vue` — экран конвертера (тонкий): разметка строк, прописью, формула;
  логика — в composables ниже.
- `app/config/currencies.ts` — каталог валют (`DEFAULT_CURRENCIES`, `MAX_AMOUNT`, `DEFAULT_AMOUNT`).
- `app/composables/useNbrbRates.ts` — загрузка курсов (`api.nbrb.by`), кэш в `localStorage`
  (TTL 12 ч, ключ `nbrb_rates_v1`), состояние строк и действия ввода (+/−, пересчёт).
- `app/composables/useCopyFeedback.ts` — копирование в буфер с вспышкой ok/err (Vue-обёртки).
- `app/utils/converter.ts` — конвертация и адаптивный шаг (чистые функции).
- `app/utils/formatters.ts` — формат чисел (`ru-RU`, decimal) и формула `FORMULA_FACTOR = 0.16`.
- `app/utils/numberToWords.ts` — сумма прописью на русском (возвращает **нижний регистр**).
- `app/utils/nbrb.ts` — парсинг ответа НБ РБ (нормализация `Cur_Scale`).
- `app/utils/ratesCache.ts` — валидация/сериализация кэша курсов (чистые функции).
- `app/utils/copyFeedback.ts` — clipboard + флеш-машина + выбор цвета (чистые функции).
- `app/directives/holdRepeat.ts` — автоповтор +/− при удержании.
- `tests/` — Vitest на утилиты, конфиг и директиву.

Чистая логика вынесена в `app/utils/*` (+ конфиг) и покрыта тестами; composables — тонкие
Vue-обёртки над ними. Сам рендер композного состояния (полная интеграция composable) тестами
не покрыт — окружение Vitest `node` не резолвит `vue`; трекается в issue #48.

## Конвенции

- Комментарии и JSDoc — на английском; пользовательский текст и README — на русском.
- Чистые функции выносим в `app/utils/*` и покрываем тестами; UI-логику держим в компонентах.
- Данные из API рендерим только через `{{ }}` (auto-escape) — никакого `v-html` с внешними данными.

## Деплой

GHCR + Watchtower за nginx-proxy. Подробности и «грабли» — в [`docs/AI_DEPLOY_GUIDE.md`](docs/AI_DEPLOY_GUIDE.md),
пользовательская инструкция — в [`README.md`](README.md). Инфраструктурный долг — issue #52.
</content>
</invoke>
