# Конвертер валют НБ РБ

Конвертер валют по официальному курсу Национального банка Республики Беларусь.

## Возможности

- Актуальные курсы НБ РБ (USD, EUR, BYN, RUB, CNY, TRY)
- Конвертация в любую из поддерживаемых валют
- Кнопки +/− с автоповтором при удержании (адаптивный шаг, ускорение)
- Кэш курсов в sessionStorage (12 ч) — НБ РБ обновляет раз в день
- Тёмная тема
- Статическое приложение (без серверной части)
- Mobile-first дизайн

## Технологии

- [Nuxt 4](https://nuxt.com/) + статическая генерация
- [Bitrix24 UI](https://bitrix24.github.io/b24ui/)
- [Tailwind CSS v4](https://tailwindcss.com/)

## Локальная разработка

```bash
pnpm install
pnpm dev
```

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

curl -O https://raw.githubusercontent.com/bx-shef/currency-converter/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/bx-shef/currency-converter/main/docker-compose.nginxproxy.yml
curl -O https://raw.githubusercontent.com/bx-shef/currency-converter/main/Makefile
curl -o .env.prod https://raw.githubusercontent.com/bx-shef/currency-converter/main/.env.prod.example

nano .env.prod  # заполнить DOMAIN и LETSENCRYPT_EMAIL
```

**3. Создать сеть и запустить**
```bash
docker network create proxy-net 2>/dev/null || true
make init-nginxproxy   # nginx-proxy + Let's Encrypt
make prod-up           # приложение + Watchtower
```

### Обновление конфига на сервере

Если `docker-compose.prod.yml` изменился в репозитории, обнови файл через curl:

```bash
cd /home/bitrix/currency-converter
curl -O https://raw.githubusercontent.com/bx-shef/currency-converter/main/docker-compose.prod.yml
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
make prod-redeploy  # принудительно обновить без ожидания Watchtower
make logs           # логи приложения
```

## Документация

- [B24UI](https://bitrix24.github.io/b24ui/)
- [B24 JS SDK](https://bitrix24.github.io/b24jssdk/)
- [B24 Icons](https://bitrix24.github.io/b24icons/)
- [REST API Bitrix24](https://apidocs.bitrix24.ru/)
