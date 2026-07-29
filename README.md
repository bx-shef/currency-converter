# Конвертер валют НБ РБ

> Last reviewed: 2026-07-29

Конвертер валют по официальному курсу Национального банка Республики Беларусь.

## Возможности

- Актуальные курсы НБ РБ (BYN, RUB, KZT, CNY, RSD, TRY, USD, EUR)
- Конвертация в любую из поддерживаемых валют
- Копирование суммы из любой строки и результата формулы «чистым» числом
  (с точкой, без пробелов, без группировки) — для вставки в Excel
- Кнопки +/− с автоповтором при удержании: повтор стартует после короткой
  паузы и ускоряется, пока кнопка зажата
- Адаптивный шаг кнопок: 1 при значении до 10, 10 — до 200, 100 — от 200
- Сумма прописью для BYN и RUB (формат как в платёжке: «рубль / копейка»),
  с переключателем регистра первой буквы (строчная / заглавная)
- Кэш курсов в localStorage (12 ч) — НБ РБ обновляет раз в день
- Резервная копия курсов (`public/rates-fallback.json`): если API НБ РБ недоступен при первой
  загрузке, показываются последние сохранённые курсы с пометкой «резервная копия» (issue #80)
- Светлая и тёмная тема — кнопка в шапке (по умолчанию системная тема, переключение запоминается)
- Статическое приложение (без серверной части)
- Mobile-first дизайн
- Встройка в Битрикс24 — виджет `IM_TEXTAREA` в панели чата с вставкой суммы прописью в сообщение
  (в мобильном приложении Б24 — крупнее контролы, копирование и вставка скрыты)

## Встройка в Битрикс24

Приложение умеет работать в двух режимах: как обычный сайт и внутри Битрикс24 как
iframe-приложение — виджет в панели над полем ввода сообщения чата.

> Как зарегистрировать приложение в портале, что прописать в его карточке и как оно
> устанавливается — [`docs/PROCESS.md`](docs/PROCESS.md) §0.1 и §5.

### Локализация

UI виджета и страницы установки переведены через `@nuxtjs/i18n`. Полные переводы — `ru`, `en`; для остальных языков, поддерживаемых Битриксом, ключи падают в английский фолбэк, плюс отдельно переведён `app.title` (он попадает в `LANG_ALL` у `placement.bind` и показывается как имя виджета в нужном языке портала).

Добавить язык: положить JSON в `i18n/locales/<code>.json` и добавить код в `i18n/i18n.ts`.

### Отображение чисел

Суммы показываются в формате `1 234 567,89` (decimal, ровно 2 знака после
запятой, группировка тысяч неразрывным пробелом, локаль `ru-RU`). Код валюты
выводится в левой колонке строки — внутрь поля ввода он намеренно не
включается, чтобы не сужать поле и не обрезать число. Цифры используют
`tabular-nums` (моноширинные), поэтому не «прыгают» при пересчёте.

## Формула

Под списком валют выводится служебный расчёт от суммы в BYN:

```
(BYN − 20%) × 20% = Y
```

Алгебраически это `BYN × 0.8 × 0.2 ≡ BYN × 0.16` — константа
`FORMULA_FACTOR = 0.16` в [`app/utils/formatters.ts`](app/utils/formatters.ts).
Результат округляется до 2 знаков. Требование задано владельцем страницы.

Под результатом формулы небольшим шрифтом выводится текущий календарный
квартал (например, «II квартал 2026»).

## Структура

> Документация проекта — три файла: [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md) (из чего
> собран проект и что в каком статусе), [`docs/PROCESS.md`](docs/PROCESS.md) (весь путь от
> настройки до публикации в Bitrix24) и [`docs/FUTURE.md`](docs/FUTURE.md) (что отложено на
> потом). Разбор по файлам и конвенции кода — в [`CLAUDE.md`](CLAUDE.md). Ниже — общий обзор.

```
app/
  app.vue                  — тонкий корень: useHead/SEO, theme-init (FOUC-гард), <NuxtLayout>
  layouts/default.vue      — каркас сайта: шапка (тема, навигация), подвал и Яндекс.Метрика
  layouts/clear.vue        — минимальный layout для /install и /widget/converter
  app.config.ts            — включает colorMode b24ui (без него переключатель темы — no-op)
  assets/css/main.css      — глобальные стили (подключается в nuxt.config.ts)
  pages/index.vue          — экран конвертера (тонкий): строки, прописью, формула, nudge «Помог курс?»
  config/currencies.ts     — каталог валют (состав, MAX_AMOUNT, дефолт)
  composables/
    useNbrbRates.ts        — загрузка курсов, кэш, состояние строк, ввод, health-цели
    useCopyFeedback.ts     — копирование в буфер с вспышкой ok/err
    useMetrikaGoal.ts      — обёртка над Яндекс.Метрикой (цели, no-op вне standalone)
  utils/                   — чистые функции, покрыты тестами:
    converter.ts           — конвертация и адаптивный шаг
    formatters.ts          — формат чисел, формула, «чистое» число для буфера, метка квартала
    numberToWords.ts       — сумма прописью на русском
    nbrb.ts                — парсинг ответа НБ РБ, слияние дневного/месячного фидов
    ratesCache.ts          — валидация/сериализация кэша курсов
    copyFeedback.ts        — clipboard + флеш-машина + выбор цвета
    site.ts / build.ts     — ссылки экосистемы, промо-карточки, версия сборки для подвала
  directives/holdRepeat.ts — автоповтор +/− при удержании
  components/              — SiteFooter, ConverterPromo (промо-карточки под калькулятором) и др.
  plugins/webVitals.client.ts — Core Web Vitals (LCP/CLS/INP) → цели Метрики (только standalone)
public/metrika.js          — статический бутстрап Яндекс.Метрики (CSP без inline-скриптов)
public/rates-fallback.json — снапшот «последних известных курсов» (fallback при сбое API, #80)
public/og.png              — готовый рендер OG-картинки (закоммичен; регенерация pnpm og:snapshot)
scripts/og.svg             — исходник OG-картинки (→ public/og.png через scripts/gen-og.mjs)
scripts/csp-hashes.mjs     — подстановка sha256-хэшей inline-скриптов в CSP при сборке
scripts/gen-og.mjs         — генератор OG-картинки из og.svg (Chromium; pnpm og:snapshot)
scripts/gen-rates-fallback.mjs — генератор снапшота курсов (pnpm rates:snapshot)
tests/                     — vitest: *.test.ts (node) + nuxt/ (@nuxt/test-utils: composables, index.vue)
```

Диагностика/приватность (цели Метрики, инвариант «shape/outcome, never content») —
[`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md) §4.

Курсы берутся из публичного API НБ РБ:
`https://api.nbrb.by/exrates/rates?periodicity=0` (поля `Cur_Abbreviation`,
`Cur_Scale`, `Cur_OfficialRate`; курс за единицу = `Cur_OfficialRate / Cur_Scale`).

## Технологии

- [Nuxt 4](https://nuxt.com/) + статическая генерация
- [Bitrix24 UI](https://bitrix24.github.io/b24ui/)
- [Tailwind CSS v4](https://tailwindcss.com/)

## Локальная разработка

```bash
pnpm install   # postinstall сам прогонит `nuxt prepare` (генерит .nuxt/ для lint/typecheck/test)
pnpm dev
```

Проверки перед пушем (запускаются и в CI):

```bash
pnpm lint        # ESLint (в т.ч. @intlify/vue-i18n/no-unused-keys — осиротевшие ключи локалей)
pnpm typecheck   # vue-tsc
pnpm test        # Vitest
```

Одной командой все гейты (install + lint + typecheck + test + generate) — запусти
и пришли вывод:

```bash
bash scripts/check.sh                                    # Linux/macOS
powershell -ExecutionPolicy Bypass -File scripts\check.ps1   # Windows
```

Встройку в Б24 автотесты не покрывают (нужен реальный портал). Для визуальной
проверки: `pnpm dev` и открыть `/`, `/install`, `/widget/converter` — на `/install`
крутится прогресс с редиректом на `/` (вне портала), виджет показывает конвертер
с прописью и неактивной кнопкой «Вставить в чат».

Переменные для локальной разработки — в `.env` (образец в `.env.example`):

| Переменная | Описание |
|---|---|
| `NUXT_PUBLIC_YANDEX_COUNTER_ID` | ID счётчика Яндекс.Метрики (только цифры, необязательно) |
| `NUXT_ALLOWED_HOSTS` | Разрешённые хосты dev-сервера через запятую — нужно для туннелей (ngrok, localtunnel) |

## Деплой

Push в `main` → GitHub Actions собирает образ → выкладывает в GHCR → Watchtower на сервере
обновляет контейнер за ~5 минут, за общим nginx-proxy с сертификатом Let's Encrypt.

> Настройка сервера, переменные, команды `make`, откат и разбор инцидентов —
> [`docs/PROCESS.md`](docs/PROCESS.md) §0.3, §4 и §7.


## Документация

- [B24UI](https://bitrix24.github.io/b24ui/)
- [B24 JS SDK](https://bitrix24.github.io/b24jssdk/)
- [B24 Icons](https://bitrix24.github.io/b24icons/)
- [REST API Bitrix24](https://apidocs.bitrix24.ru/)
