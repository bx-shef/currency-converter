# Конвертер валют НБ РБ

> Last reviewed: 2026-07-03

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
- Светлая и тёмная тема — кнопка в шапке (по умолчанию системная тема, переключение запоминается)
- Статическое приложение (без серверной части)
- Mobile-first дизайн
- Встройка в Битрикс24 — виджет `IM_TEXTAREA` в панели чата с вставкой суммы прописью в сообщение
  (в мобильном приложении Б24 — крупнее контролы, копирование и вставка скрыты)

## Встройка в Битрикс24

Приложение умеет работать в двух режимах: standalone (обычный сайт) и внутри Битрикс24 как iframe-приложение.

### Установка в портал

В разделе «Разработчикам → Иное → Локальное приложение»:

- **Application URL:** `https://<host>/`
- **Installation URL:** `https://<host>/install`
- **Scopes (права):** `user_brief`, `im`, `placement`

Страница `/install` сама вызовет `placement.bind` и зарегистрирует место встраивания
`IM_TEXTAREA` (виджет в панели над полем ввода сообщения чата) на обработчик
`/widget/converter`.

### Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `NUXT_PUBLIC_SITE_URL` | — | Публичный URL приложения. Нужен в проде, чтобы install-страница построила правильный `HANDLER` для `placement.bind`. В dev (через ngrok и т.п.) URL вычисляется из адреса браузера. |
| `NUXT_PUBLIC_AUTHOR_NAME` | `bx-shef` | Подпись в подвале виджета. |
| `NUXT_PUBLIC_AUTHOR_URL` | `https://bx-shef.by` | Ссылка с подписи в подвале виджета. |
| `NUXT_PUBLIC_MARKETPLACE_URL` | — | Ссылка на приложение в Маркете Bitrix24 (промо-блок под калькулятором). Пусто → блок ведёт на страницу установки `/install`, чтобы не было битой ссылки до публикации. |
| `NUXT_PUBLIC_COMMIT_SHA` | — | Git-коммит сборки — ссылка «сборка &lt;sha&gt;» в подвале. В CI подставляется `github.sha`, в dev пусто (показывается «сборка dev»). |

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

```
app/
  app.vue                  — каркас (шапка, тема, навигация, подвал, SEO, Метрика)
  app.config.ts            — включает colorMode b24ui (без него переключатель темы — no-op)
  assets/css/main.css      — глобальные стили (подключается в nuxt.config.ts)
  pages/index.vue          — экран конвертера (тонкий): строки, прописью, формула
  config/currencies.ts     — каталог валют (состав, MAX_AMOUNT, дефолт)
  composables/
    useNbrbRates.ts        — загрузка курсов, кэш, состояние строк, ввод
    useCopyFeedback.ts     — копирование в буфер с вспышкой ok/err
  utils/                   — чистые функции, покрыты тестами:
    converter.ts           — конвертация и адаптивный шаг
    formatters.ts          — формат чисел, формула, «чистое» число для буфера, метка квартала
    numberToWords.ts       — сумма прописью на русском
    nbrb.ts                — парсинг ответа НБ РБ
    ratesCache.ts          — валидация/сериализация кэша курсов
    copyFeedback.ts        — clipboard + флеш-машина + выбор цвета
  directives/holdRepeat.ts — автоповтор +/− при удержании
  components/SiteFooter.vue  — центральные ссылки подвала (НБ РБ, оферта); copyright/GitHub — в app.vue
public/metrika.js          — статический бутстрап Яндекс.Метрики (CSP без inline-скриптов)
scripts/og.svg             — исходник OG-картинки (→ public/og.png на этапе docker build)
scripts/csp-hashes.mjs     — подстановка sha256-хэшей inline-скриптов в CSP при сборке
tests/                     — vitest: *.test.ts (node) + nuxt/ (@nuxt/test-utils: composables, index.vue)
```

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

## Деплой на сервер

### Схема

Push в `main` → GitHub Actions билдит образ → пушит в **GHCR** (`ghcr.io/bx-shef/currency-converter`) → **Watchtower** на сервере автоматически обновляет контейнер (~5 мин).

На сервере **не нужен** `git clone` — только три файла и `.env.prod`.

### Первоначальная настройка сервера

**1. Установить Docker**
```bash
curl -fsSL https://get.docker.com | sh
```

> Docker-образ публичный (репозиторий публичный) — `docker login ghcr.io` **не нужен**.

**2. Скачать файлы на сервер**
```bash
mkdir -p /home/bitrix/currency-converter && cd /home/bitrix/currency-converter

curl -fsSLO https://raw.githubusercontent.com/bx-shef/currency-converter/main/docker-compose.prod.yml
curl -fsSLO https://raw.githubusercontent.com/bx-shef/currency-converter/main/docker-compose.nginxproxy.yml
curl -fsSLO https://raw.githubusercontent.com/bx-shef/currency-converter/main/Makefile
curl -fsSL -o .env.prod https://raw.githubusercontent.com/bx-shef/currency-converter/main/.env.prod.example

nano .env.prod  # заполнить DOMAIN и LETSENCRYPT_EMAIL
```

**3. Создать сеть и запустить**
```bash
make init-network      # docker-сеть proxy-net
make init-nginxproxy   # nginx-proxy + Let's Encrypt
make prod-up           # приложение + Watchtower
```

### Обновление конфига на сервере

Если `docker-compose.prod.yml` изменился в репозитории, обнови файл через curl:

```bash
cd /home/bitrix/currency-converter
curl -fsSLO https://raw.githubusercontent.com/bx-shef/currency-converter/main/docker-compose.prod.yml
make prod-up
```

### Переменные окружения

#### `.env.prod` на сервере

| Переменная | Описание |
|---|---|
| `DOMAIN` | Домен сайта (DNS → IP сервера) |
| `LETSENCRYPT_EMAIL` | Email для SSL-сертификата |

#### GitHub Secrets (Settings → Secrets and variables → Actions → **Secrets**)

| Secret | Описание |
|---|---|
| `NUXT_PUBLIC_YANDEX_COUNTER_ID` | ID счётчика Яндекс.Метрики (необязательно) |

#### GitHub Variables (Settings → Secrets and variables → Actions → **Variables**)

Это **Variables**, не Secrets (значения не секретные, запекаются в публичный бандл):

| Variable | Описание |
|---|---|
| `NUXT_PUBLIC_SITE_URL` | Публичный URL приложения. **Обязателен для встройки в Б24** — без него install-страница намеренно откажется регистрировать виджет (`placement.bind` требует абсолютный HANDLER). |
| `NUXT_PUBLIC_AUTHOR_NAME` | Подпись в подвале виджета (необязательно, дефолт `bx-shef`). |
| `NUXT_PUBLIC_AUTHOR_URL` | Ссылка с подписи (необязательно, дефолт `https://bx-shef.by`). |
| `NUXT_PUBLIC_MARKETPLACE_URL` | Ссылка на приложение в Маркете Bitrix24 (промо-блок под калькулятором; необязательно). Пусто → блок ведёт на `/install`. |

`NUXT_PUBLIC_COMMIT_SHA` в Variables заводить не нужно — CI подставляет его из `github.sha` автоматически (ссылка «сборка &lt;sha&gt;» в подвале).

### Команды

```bash
make prod-up        # запустить / перезапустить
make prod-down      # остановить
make prod-pull      # скачать свежий образ без перезапуска
make prod-redeploy  # принудительно обновить без ожидания Watchtower
make logs           # логи приложения
```

## Документация

- [B24UI](https://bitrix24.github.io/b24ui/)
- [B24 JS SDK](https://bitrix24.github.io/b24jssdk/)
- [B24 Icons](https://bitrix24.github.io/b24icons/)
- [REST API Bitrix24](https://apidocs.bitrix24.ru/)
