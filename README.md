# Конвертер валют НБ РБ

Конвертер валют по официальному курсу Национального банка Республики Беларусь.

## Возможности

- Актуальные курсы НБ РБ (USD, EUR, BYN, RUB, KZT, CNY, TRY)
- Конвертация в любую из поддерживаемых валют
- Копирование суммы из любой строки одной кнопкой
- Копирование результата формулы «чистым» числом (с точкой, без пробелов) — для вставки в Excel
- Кнопки +/− с автоповтором при удержании: повтор стартует после короткой
  паузы и ускоряется, пока кнопка зажата
- Адаптивный шаг кнопок: 1 при значении до 10, 10 — до 200, 100 — от 200
- Сумма прописью для BYN и RUB (формат как в платёжке: «рубль / копейка»),
  с переключателем регистра первой буквы (строчная / заглавная)
- Кэш курсов в localStorage (12 ч) — НБ РБ обновляет раз в день
- Светлая и тёмная тема — кнопка в шапке (по умолчанию системная тема, переключение запоминается)
- Статическое приложение (без серверной части)
- Mobile-first дизайн

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

## Структура

```
app/
  app.vue                  — каркас (шапка, тема, навигация, подвал, SEO, Метрика)
  pages/index.vue          — экран конвертера (тонкий): строки, прописью, формула
  config/currencies.ts     — каталог валют (состав, MAX_AMOUNT, дефолт)
  composables/
    useNbrbRates.ts        — загрузка курсов, кэш, состояние строк, ввод
    useCopyFeedback.ts     — копирование в буфер с вспышкой ok/err
  utils/                   — чистые функции, покрыты тестами:
    converter.ts           — конвертация и адаптивный шаг
    formatters.ts          — формат чисел, формула, «чистое» число для буфера
    numberToWords.ts       — сумма прописью на русском
    nbrb.ts                — парсинг ответа НБ РБ
    ratesCache.ts          — валидация/сериализация кэша курсов
    copyFeedback.ts        — clipboard + флеш-машина + выбор цвета
  directives/holdRepeat.ts — автоповтор +/− при удержании
  components/SiteFooter.vue  — подвал: ссылки (НБ РБ, оферта, GitHub)
scripts/og.svg             — исходник OG-картинки (→ public/og.png на этапе docker build)
tests/                     — vitest на утилиты, конфиг и директиву
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
pnpm install
pnpm dev
```

Проверки перед пушем (запускаются и в CI):

```bash
pnpm lint        # ESLint
pnpm typecheck   # vue-tsc
pnpm test        # Vitest
```

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

#### GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Описание |
|---|---|
| `NUXT_PUBLIC_YANDEX_COUNTER_ID` | ID счётчика Яндекс.Метрики (необязательно) |

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
