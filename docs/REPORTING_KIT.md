# Reporting Kit — отчётность и работа с агентом

> Last reviewed: 2026-06-29

Переносимый набор (kit) для работы с AI-агентом и отчётности проекта в Telegram:
навыки-отчёты (`/report-status`, `/report-digest`, `/report-questions`), безопасная
отправка в Telegram, типовые сценарии review/merge, проверки и CI. Сам бандл лежит
в репозитории — [`../reporting-kit/`](../reporting-kit/) (этот документ — указатель и
карточка интеграции; быстрый старт и детали — в [README кита](../reporting-kit/README.md)).

## TL;DR

- **Что это:** самодостаточный шаблон — лежит в `reporting-kit/`, даёт три навыка-отчёта
  + скрипт отправки в Telegram + проверки + собственный CI.
- **Навыки только готовят текст** отчёта; отправляет `reporting-kit/scripts/tg-send.sh`
  и только по явной команде «шли». Все отчёты идут в один канал (`TG_CHAT_ID`).
- **Канон промптов — `reporting-kit/docs/reports/`**, навыки `.claude/skills/*/SKILL.md` —
  их зеркало; идентичность проверяет `check-skills`.
- **Как лежит у нас:** вендорный бандл — держим как есть, чтобы легко синхронизировать с
  источником (`ai-agent`). Не линтуется нашими проверками: исключён из `tests/mdReviewStamp.test.ts`
  (у него свои конвенции и собственный CI внутри `reporting-kit/.github/`, который GitHub не запускает).
- **Telegram пока не заведён.** Бот/канал не созданы, `.env` не заполнен — отчёты можно
  генерировать навыками, но отправка (`tg-send.sh`) включится после настройки токенов.

## Состав (кратко)

| Путь | Назначение |
|---|---|
| [`reporting-kit/CLAUDE.md`](../reporting-kit/CLAUDE.md) | Правила репозитория + типовые сценарии review и merge |
| `reporting-kit/docs/project-map.md` | Карта проекта (заполнена под currency-converter; источник для отчётов) |
| `reporting-kit/docs/reports/*` | Канон промптов отчётов (эталон, зеркалится в навыки) |
| `reporting-kit/.claude/skills/`, `.claude/commands/` | `/report-status`, `/report-digest`, `/report-questions` |
| `reporting-kit/scripts/tg-send.sh` | Отправка текста в Telegram (отказывает без токена/`chat_id`) |
| `reporting-kit/scripts/check-*.{sh,ps1}` | Проверки kit (Linux + Windows) |
| `reporting-kit/.github/` | Собственный CI бандла + оффлайн-проверка ссылок |

Полная таблица и быстрый старт — в [README кита](../reporting-kit/README.md).

## Навыки и отчёты

| Навык | Команда | Что делает |
|---|---|---|
| report-status | `/report-status` | срез состояния проекта по `reporting-kit/docs/project-map.md` |
| report-digest | `/report-digest` | дайджест по репозиториям за период (кратко + подробно) |
| report-questions | `/report-questions` | вопросник заказчику по открытым пунктам карты |

Навыки и команды бандла Claude Code подхватывает из `reporting-kit/.claude/` и применяет
в области файлов под `reporting-kit/` (так же, как в источнике).

## Безопасность

> [!CAUTION]
> **Токен Telegram-бота — секрет.** `.env` хранится только локально (`chmod 600`),
> в репозиторий не коммитится (`.gitignore` кита + корневой `.gitignore`). В CI/облаке —
> переменные окружения/секреты, не файл. `tg-send.sh` уводит токен из argv через
> `curl --config` (не виден в `ps aux`), но запускать всё равно стоит на доверенном хосте.
> Целевой канал — приватный; бот в нём админ с правом публикации.

## Как лежит у нас (вендоринг)

`reporting-kit/` — самодостаточный бандл со своими конвенциями и CI
(`reporting-kit/.github/workflows/` GitHub не запускает — активны только workflow
в корневом `.github/`). Чтобы наш пайплайн не конфликтовал с чужими правилами бандла:

- бандл исключён из `tests/mdReviewStamp.test.ts` (стамп-конвенция — наша, не его);
- в `.dockerignore` добавлен `reporting-kit` — в прод-образ Nuxt он не попадает.

Свои проверки у кита запускаются изнутри:
`bash reporting-kit/scripts/check-{tg,skills,docs}.sh`.

## Синхронизация с источником

Бандл живёт в репозитории-источнике (`ai-agent`, каталог `reporting-kit/`). Чтобы
подтянуть его обновления, не потеряв наши адаптации:

1. Скопировать свежий бандл поверх нашего:
   `cp -a <путь-к-ai-agent>/reporting-kit/. reporting-kit/`.
2. **Восстановить файлы, адаптированные под этот проект** (источник их перезатрёт
   обобщённым шаблоном) — вернуть из git:
   `git checkout -- reporting-kit/docs/project-map.md reporting-kit/CLAUDE.md`
   (в `project-map.md` — реальные данные проекта; в `CLAUDE.md` — таблица
   «Связанные репозитории» с `bx-shef/currency-converter`).
3. Просмотреть остальной diff (`git diff reporting-kit/`) — это реальные правки
   источника; принять осознанно.
4. Прогнать self-checks бандла:
   `cd reporting-kit && bash scripts/check-skills.sh && bash scripts/check-docs.sh && bash scripts/check-tg.sh`.
5. Прогнать проектный пайплайн: `pnpm lint && pnpm typecheck && pnpm test`.

> Наша копия и источник **могут расходиться** (мы адаптировали `project-map.md`
> и таблицу репозиториев). Поэтому это не «чистый» upstream-pull, а слияние с
> ручным шагом 2. Замеченные при ревью улучшения внутренностей бандла лучше
> отправлять **в источник** (`ai-agent`), а не править здесь — иначе расхождение
> растёт.

## Что сделать, чтобы включить отправку в Telegram

1. Создать бота у @BotFather, получить токен.
2. Добавить бота в приватный канал админом, узнать `chat_id`.
3. Заполнить `TG_BOT_TOKEN`/`TG_CHAT_ID` (локально — `reporting-kit/.env`, `chmod 600`;
   в облаке — переменные окружения + `api.telegram.org` в сетевой allowlist).
4. Проверить: `bash reporting-kit/scripts/check-tg.sh`.

## Связанное

- [README кита](../reporting-kit/README.md) — быстрый старт, переменные, навыки.
- [`reporting-kit/CLAUDE.md`](../reporting-kit/CLAUDE.md) — сценарии review/merge и операционная дисциплина агента.
