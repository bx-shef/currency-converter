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
pnpm build        # nuxt build/generate
```

Перед пушем прогоняй `pnpm lint && pnpm typecheck && pnpm test` — это же гоняет CI.

## Архитектура

- `app/pages/index.vue` — экран конвертера: строки валют, ввод, прописью, формула. Здесь же
  fetch курсов (`api.nbrb.by`), кэш в `localStorage` (TTL 12 ч, ключ `nbrb_rates_v1`).
- `app/utils/converter.ts` — конвертация и адаптивный шаг (чистые функции).
- `app/utils/formatters.ts` — формат чисел (`ru-RU`, decimal) и формула `FORMULA_FACTOR = 0.16`.
- `app/utils/numberToWords.ts` — сумма прописью на русском (возвращает **нижний регистр**).
- `app/directives/holdRepeat.ts` — автоповтор +/− при удержании.
- `tests/` — Vitest на утилиты и директиву.

Бизнес-логика (fetch/кэш) пока заперта в `<script setup>` и не покрыта юнит-тестами —
вынос в composables отслеживается в issue #48.

## Конвенции

- Комментарии и JSDoc — на английском; пользовательский текст и README — на русском.
- Чистые функции выносим в `app/utils/*` и покрываем тестами; UI-логику держим в компонентах.
- Данные из API рендерим только через `{{ }}` (auto-escape) — никакого `v-html` с внешними данными.

## Деплой

GHCR + Watchtower за nginx-proxy. Подробности и «грабли» — в [`docs/AI_DEPLOY_GUIDE.md`](docs/AI_DEPLOY_GUIDE.md),
пользовательская инструкция — в [`README.md`](README.md). Инфраструктурный долг — issue #52.
</content>
</invoke>
