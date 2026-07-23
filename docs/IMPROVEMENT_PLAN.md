# План улучшения (по образцу ai-price-import)

> Last reviewed: 2026-07-22

План приведения `currency-converter` к практикам full-stack-проекта `ai-price-import`.
`ai-price-import` — full-stack (Nitro + Postgres + Redis/BullMQ + OTel/Grafana + AI-агент);
`currency-converter` — **чистая статика (SSG), без сервера**. Поэтому «фишки» делятся на уровни.

## Уровни (порядок обязателен — не начинать с сервера)

| Уровень | Что | Цена |
|---|---|---|
| **A. Статикой (0 инфры)** | деплой-харденинг, скриншот-тесты, доки, рейтинг-nudge, 👍/👎-цели, web-vitals, политика | дёшево, не ломает SSG |
| **B. +1 serverless-функция** | сбор фидбэка → GitHub-issue в приватный репо + AI-триаж | ломает «чистый SSG», 1 функция |
| **C. +сервер (Nitro)** | Black Hole на Nitro, серверный OTel, очереди | архитектурно, только под спрос |

> **Уровни B и C — предложение, не commitment.** Первая строка CLAUDE.md — «Статическое
> приложение (SSG), **без серверной части**» — остаётся инвариантом проекта. B/C намеренно его
> ломают, поэтому берутся **только под конкретный спрос** и по отдельному решению владельца; до
> этого момента они здесь как исследованная опция, а не принятое направление.
>
> **«Black Hole»** — закрытая VM Bitrix-Cloud (Vibecode) с REST-деплоем без SSH: приложение
> крутится там одним процессом Nitro. Для конвертера это уровень C (нужен сервер), берётся под
> спрос портала; термин унаследован из экосистемы (`ai-price-import`).

## Легенда статуса

`✅` сделано/в проде · `🧪` код на ветке, не гонялось live/не смёржено · `📝` спроектировано · `⛔` блокер · `⏳` в работе

---

## Фаза P0 — дёшево, сразу (статика/CI)

| # | Задача | Файл | Статус |
|---|--------|------|--------|
| P0-1 | Корневой `.claude/` SessionStart-хук (corepack + install + nuxt prepare) | `.claude/` | ✅ |
| P0-2 | `pnpm check` alias (`lint && typecheck && test`) | `package.json` | ✅ |
| P0-3 | `nginx -t` + ассерт CSP-плейсхолдера на сборке | `Dockerfile` | ✅ |
| P0-4 | Лог-ротация json-file (10m×3) | `docker-compose.prod.yml` | ✅ |
| P0-5 | `concurrency:` на deploy-джобе | `.github/workflows/ci.yml` | ✅ |
| P0-6 | Метрика-цели на сбои загрузки: `rates_load_failed`, `rates_monthly_missing` (DI-репортер) | `useNbrbRates` | 🧪 |

> P0-6: цели через инъекцию `onGoal` (тестируемо, без `window.ym`-плюмбинга); PII-инвариант
> «shape/outcome, never content» — шлём факт сбоя, не значения курсов. Отброшено: `cache_fallback`
> (кэш — штатный happy-path, цель на каждую загрузку = шум) и клиентский трекинг JS-ошибок
> (в Метрике это настройка счётчика в дашборде, не флаг инициализации в `public/metrika.js`).

## Фаза P1 — фичи ценности (без сервера)

| # | Задача | Статус |
|---|--------|--------|
| P1-1 | 🖼 Скриншот-харнесс (Playwright-core: роут × {375,1280} × {light,dark}) + `VISUAL_VERIFICATION.md` | 🧪 |
| P1-2 | Рейтинг-nudge на Маркет (localStorage-троттлинг, `MARKETPLACE_URL`, слайдер фрейма) | 📝 |
| P1-3 | 👍/👎 «Помог курс?» → Метрика-цели (`converter_helpful_yes/no`) | 🧪 |
| P1-4 | web-vitals (LCP/CLS/INP) → Метрика | 📝 |
| P1-5 | `docs/MANUAL_TEST_PLAN.md` (сценарий→шаги→ожидание→✓/✗) | 📝 |
| P1-6 | Внешний smoke (`curl https://<domain>/ → 200`) | 📝 |

## Фаза P2 — доки/полировка

| # | Задача | Статус |
|---|--------|--------|
| P2-1 | `docs/OPERATIONS.md` (TLS<14д, uptime, prune, rollback) | 📝 |
| P2-2 | `docs/MARKETPLACE_RELEASE.md` (гейты публикации) | 📝 |
| P2-3 | `docs/DATA_POLICY.md` (потоки данных, privacy) | 📝 |
| P2-4 | `docs/DIAGNOSTICS_POLICY.md` (что трекаем, инвариант «значения не покидают браузер») | 📝 |
| P2-5 | Свободный текст фидбэка → Б24-форма/`mailto` | 📝 |

## Фаза C — по спросу (архитектурно)

- Black Hole: Nitro `node-server` preset + `APP_EDGE_SECURITY`-middleware (CSP байт-в-байт с nginx.conf; hash-CSP → `'unsafe-inline'`), либо дёшево «Black Hole как VPS» (compose на VM).
- Serverless-фидбэк: 1 функция (переиспользует чистые `feedback.ts`/`feedbackConfig.ts`/`feedbackGithub.ts` примера) → приватный `currency-converter-feedback` → AI-триаж (`FEEDBACK_TRIAGE_AGENT.md`).
- First-party OTLP-beacon в `telemetry-station` (нужен TLS-endpoint + CORS + CSP; bearer в браузере не секрет).

## Явно НЕ брать (N/A для статики)

BullMQ/Redis/Postgres/worker-fleet · токен-стор · AI-агент · edge-security middleware (есть nginx) ·
role-guides (нет server/admin-ролей) · vhost-tune/proxy-healthcheck body-cap (нет загрузок).

## Принципы (из примера, уже совпадают с нашими)

Чистые функции + DI, транспорт только по краям, no-op-safe env-гейты, fail-safe фолбэки,
юнит-тесты на ядрах. PII: «shape/outcome, never content». На UI-правках — сверяться с
[b24ui llms.txt](https://bitrix24.github.io/b24ui/llms.txt).
