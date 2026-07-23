# Инструкция AI-агенту: деплой через GHCR + Watchtower + nginx-proxy

> Last reviewed: 2026-07-23

Эту инструкцию нужно отдать AI-агенту в репозитории, где предстоит настроить
автоматический деплой. Агент обязан **сначала** прислать план и вопросы,
**потом** реализовать и **в конце** дать чеклист.

---

## Схема, которую агент настраивает

```
push в main
  └─ GitHub Actions: docker build → push в ghcr.io/<owner>/<repo>:latest
       └─ Watchtower на сервере (интервал ~5 мин) подхватывает новый образ
            └─ контейнер пересоздаётся за общим nginx-proxy (TLS через Let's Encrypt)
```

Сервер уже работает (или будет работать) с общим reverse-proxy на одном порту 80/443,
к которому подключаются все сайты через docker-сеть.

---

## Что агент делает (артефакты в репозитории)

1. **`Dockerfile`** — multi-stage. Для SPA/SSG: `deps` → `builder` → nginx-runner.
   Для SSR: `deps` → `builder` → node-runner. Build-args для переменных, которые
   запекаются в бандл.
2. **`.dockerignore`** — минимум `node_modules`, `.git`, `.env*`, `.nuxt`, `dist`.
3. **`.github/workflows/ci.yml`** — единый pipeline (CI/CD), чтобы деплой
   зависел от зелёного CI (gating, issue #45). Jobs `ci` и `docker-build`:
   - `ci` — на push и PR: install → `nuxi prepare` → lint → test → typecheck → `nuxt generate`
     (`nuxi prepare` генерит `.nuxt/eslint.config.mjs` и `.nuxt/tsconfig.json`, без них
     lint/typecheck/test падают; локально это делает `postinstall`).
   - `docker-build` — на PR: собирает прод-образ **без push** (smoke-test
     Dockerfile; ловит поломки базы — см. «грабля #17» — до прода; работает и
     на Dependabot-PR, без секретов). Кэш `type=gha` только на чтение
     (`cache-from`, без `cache-to`) — чтобы PR-сборки не вытесняли кэш main.
4. **Job `deploy`** (в том же `ci.yml`) — `needs: ci`, только на `push: main`:
   `docker/login-action` (GHCR) → `docker/metadata-action` →
   `docker/build-push-action`. Теги `latest` + `sha-<sha>` (даёт откат),
   cache `type=gha` (read+write). `permissions: { contents: read, packages: write }`.
   Красный `ci` теперь блокирует попадание образа в GHCR.
5. **`docker-compose.prod.yml`** — приложение (`image: ghcr.io/...`) + Watchtower,
   сеть как `external: true`, label-enable.
6. **`docker-compose.nginxproxy.yml`** — `nginxproxy/nginx-proxy` + `acme-companion`.
   Включается, **только если на сервере nginx-proxy ещё не стоит**.
7. **`.env.prod.example`** — `DOMAIN`, `LETSENCRYPT_EMAIL` (+ runtime env приложения,
   если есть). Реальный `.env.prod` лежит на сервере, не в git.
8. **`Makefile`** — `prod-up`, `prod-down`, `prod-pull`, `prod-redeploy`,
   `prod-smoke`, `prod-rollback`, `logs`, `init-network`, `init-nginxproxy`.
9. **`README.md`** — раздел Deploy: ссылки на raw-URL файлов и команды для сервера.

---

## Что лежит на сервере

```
/home/<user>/<project>/
├── docker-compose.prod.yml
├── docker-compose.nginxproxy.yml   # только если nginx-proxy ещё не развернут
├── .env.prod                        # не в git
└── Makefile                         # качается curl'ом вместе с остальными (см. README)
```

**Git на сервер не клонируется.** Файлы качаются напрямую через curl из raw-ссылок:

```bash
mkdir -p /home/<user>/<project> && cd $_
BASE="https://raw.githubusercontent.com/<owner>/<repo>/main"
files=(docker-compose.prod.yml Makefile .env.prod.example)
# docker-compose.nginxproxy.yml — добавить, только если nginx-proxy ещё не стоит
# files+=(docker-compose.nginxproxy.yml)
for f in "${files[@]}"; do curl -fsSLO "$BASE/$f"; done
cp .env.prod.example .env.prod && nano .env.prod
```

Обновление файлов на сервере — тем же `curl -fsSLO`, без `git pull`.

---

## Известные грабли — учесть СРАЗУ, до генерации файлов

1. **Имя docker-сети nginx-proxy должно совпадать с тем, что уже есть на сервере.**
   На разных серверах историческое имя разное: `proxy-net`, `nginx-proxy`, `webproxy`.
   Не угадывать — **спросить пользователя** и проверить через `docker network ls`.
   Если контейнер окажется в другой сети — nginx-proxy его не увидит, отдаст 502.
   В compose помечать сеть как `external: true`.

2. **`LETSENCRYPT_EMAIL` не дублировать в per-app compose** — он живёт глобально
   в `.env.prod` рядом с nginx-proxy и обрабатывается acme-companion. В compose
   приложения оставлять только `VIRTUAL_HOST`, `VIRTUAL_PORT`, `LETSENCRYPT_HOST`.

3. **`default`-сеть в compose приложения убирать.** Без явного `networks:` для
   сервиса Compose создаст `<project>_default` — контейнер окажется в двух сетях.
   Явно указывать только сеть proxy.

4. **`container_name` задавать для каждого сервиса**, включая `watchtower`,
   `nginx-proxy`, `acme-companion`. Иначе `docker logs <name>` в чеклисте
   и Watchtower'у труднее распознать соседей.

5. **Watchtower → `DOCKER_API_VERSION=1.47`.** `containrrr/watchtower:latest`
   по умолчанию говорит на Docker API 1.25, daemon 24+ требует ≥1.44.
   Без переменной Watchtower молча не работает.

6. **Watchtower image пиновать на конкретный тег**, не `latest`.
   `latest` + mount `/var/run/docker.sock` = supply-chain attack vector:
   скомпрометированный upstream-образ обновит сам себя и получит root на хосте.
   Использовать `containrrr/watchtower:1.7.1` (или актуальный stable).

7. **Watchtower по умолчанию обновляет ВСЕ контейнеры на хосте.**
   Команда: `--interval 300 --cleanup --label-enable`.
   На приложении: `labels: ["com.centurylinklabs.watchtower.enable=true"]`.

8. **GHCR push требует `permissions: packages: write`** в workflow.
   `GITHUB_TOKEN` встроенный, отдельный PAT не нужен.

9. **Build-args vs runtime env.** Для Nuxt/Vite/Next и любых SSG/SPA публичные
   переменные «запекаются» в бандл при сборке → передавать через `build-args`
   в workflow и `ARG`/`ENV` в Dockerfile, **не** через `environment:` в compose.
   Runtime env (серверная часть, секреты сервера) — в `.env.prod` на сервере.

10. **Lockfile нужен для CI cache.** Без `pnpm-lock.yaml` / `package-lock.json`
   нельзя включить `cache: 'pnpm'` в `setup-node` — упадёт. Сгенерировать
   локально и закоммитить **до** включения кеша. Не пытаться чинить через PR
   на стороне сервера.

11. **`rsvg-convert` удалён в librsvg 2.57+.** Если в Dockerfile нужна
    SVG→PNG конвертация (OG-картинки) — на свежих Alpine (`node:22-alpine` и новее)
    `rsvg-convert` уже нет. Использовать `inkscape`:
    `apk add inkscape font-dejavu fontconfig && fc-cache -f`. Либо рендерить
    OG через библиотеку (Satori), без системного бинаря.

12. **Публичный репозиторий → публичный GHCR-образ → `docker login` на сервере
    не нужен.** Приватный → нужен PAT с `read:packages`:
    - на сервере один раз `echo $PAT | docker login ghcr.io -u <user> --password-stdin`,
    - либо `WATCHTOWER_REGISTRY_AUTH_FILE=/root/.docker/config.json` env у Watchtower.

13. **`docker compose up` / `pull` без `--env-file .env.prod`** не подхватит
    переменные. В Makefile прописывать `--env-file .env.prod` для `up`/`pull`/
    `config` вызовов (для `down` не нужен).

14. **DNS должен быть готов ДО первого запуска acme-companion** — иначе
    Let's Encrypt не сможет валидировать и закеширует rate-limit на час.

15. **CI permissions явно**: даже на чисто read-only CI добавлять
    `permissions: { contents: read }` на уровне workflow или job.
    Дефолтные permissions репозитория могут быть шире — supply-chain hardening.

16. **HSTS и security-заголовки** ставить в nginx внутри образа, а не только
    на nginx-proxy — на случай мисконфигурации внешнего слоя.
    Минимум: `Strict-Transport-Security`, `X-Content-Type-Options`,
    `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `CSP`.

17. **Node 25+ выкинул corepack из официальных образов.** `RUN corepack enable`
    в Dockerfile упадёт с `exit 127`. Держать базу на LTS со встроенным corepack
    (`node:22-alpine`, выровнено с CI), либо ставить вручную:
    `npm i -g corepack@latest && corepack enable`. Dependabot настроен НЕ прыгать
    на мажоры node автоматически — иначе сборка снова падает.

18. **nginx-runner запускается non-root → порт ≥1024.** Образ `nginxinc/nginx-unprivileged`
    работает от пользователя `nginx` и **не может** слушать `:80` (нужны root-привилегии).
    Слушать `:8080` (`listen 8080` в `nginx.conf`, `EXPOSE 8080`), а в compose приложения
    выставить `VIRTUAL_PORT: 8080` и `expose: ["8080"]`. nginx-proxy маппит на этот порт.

19. **CSP без `script-src 'unsafe-inline'` требует хэшей, генерируемых при сборке.**
    Nuxt SSG кладёт в `index.html` два inline-скрипта: FOUC-гард темы и
    `window.__NUXT__.config` (его хэш меняется каждую сборку из-за `buildId`). Поэтому
    статически зашить sha256 в `nginx.conf` нельзя — `scripts/csp-hashes.mjs` считает их
    из собранного HTML и подставляет вместо плейсхолдера `__CSP_SCRIPT_HASHES__` в Dockerfile
    (после `pnpm generate`, до `COPY` конфига в runner). Любой новый inline-скрипт без
    `src` ломает страницу (CSP заблокирует) — выносить такие скрипты в `public/*.js`
    (как Яндекс.Метрику в `public/metrika.js`) или убедиться, что их хэш попадает в CSP.

20. **За TLS-терминирующим nginx-proxy ставить `absolute_redirect off;`** (следствие
    граблей #18). Внутренний nginx видит только plain http на `:8080`, поэтому при
    дефолтном `absolute_redirect on` строит trailing-slash-редиректы (`/path` →
    `/path/`, ветка `$uri/` в `try_files`) из своих scheme+port и отдаёт
    `Location: http://host:8080/...` — утечка внутреннего порта и downgrade на http.
    В HTTPS-iframe Битрикс24 это ловится как Mixed-Content и виджет молча не грузится
    (главная/`/install/` живут на trailing slash и 200-ят без редиректа — баг виден
    только на путях без слеша, напр. `/widget/converter`). Относительный `Location`
    заставляет браузер сохранить исходный `https://host:443`.

21. **Статичный обработчик Битрикс24 → `error_page 405 =200 $uri;`.** Б24 открывает
    install/placement-обработчик через **POST**. nginx-статика (`try_files … /index.html`)
    разрешает только `GET/HEAD` и отвечает на POST `405 Not Allowed` — iframe-страница не
    рендерится. У страницы нет серверной логики на запрос: фрейм-SDK (`b24jssdk`) берёт
    контекст портала из `window.name` («domain|protocol|appSid», см. `app/composables/useB24.ts`)
    + postMessage-handshake с родителем, тело POST не читается вовсе. Поэтому достаточно
    отдать ту же пререндеренную HTML и на POST: `error_page 405 =200 $uri;` переотдаёт тот же
    `$uri` с кодом 200. Симптом: при открытии приложения из портала — белый экран
    «405 Not Allowed / nginx».

22. **json-file логи без cap растут бесконечно.** Сервису приложения задать
    `logging: { driver: json-file, options: { max-size, max-file } }` (у нас `10m×3`),
    иначе nginx access-log за месяцы забьёт диск VM. `json-file` — правильный драйвер:
    диагностика в этом гайде опирается на `docker logs`, который его сохраняет.

23. **Два быстрых пуша в main = гонка двух GHCR-push.** На deploy-джобе
    `concurrency: { group: deploy-${{ github.ref }}, cancel-in-progress: false }` —
    сериализует деплои, **не отменяя** in-flight push (полу-запушенный тег хуже ожидания).

24. **Ассерт подстановки CSP-хэшей + `nginx -t` на сборке.** В runner-стейдж Dockerfile
    после `COPY nginx.conf`: `grep -q '__CSP_SCRIPT_HASHES__' … && exit 1 || nginx -t` —
    валит сборку (в CI-джобе `docker-build`), если `csp-hashes.mjs` не подставил плейсхолдер
    (грабли #19) или конфиг синтаксически битый. Ловит до старта контейнера, а не в проде.

---

## Порядок работы агента — ОБЯЗАТЕЛЕН

### Шаг 1. Прислать план + предупреждения

Не трогая файлы, ответить пользователю:
- что собираешься создать/изменить (список файлов)
- какие из «граблей» выше применимы к конкретному стеку
- список вопросов, которые будут заданы на шаге 2

### Шаг 2. Запросить данные (одним списком, ждать ответа)

1. Домен приложения (DNS уже указывает на сервер? проверить)
2. Email для Let's Encrypt
3. Путь на сервере для конфигов
4. **Имя существующей docker-сети nginx-proxy** на сервере
   (или «нужно поднять впервые»)
5. Стек / билд-команда (`pnpm build`, `pnpm generate`, `npm run build` …)
6. SPA/SSG (статика → nginx) или SSR (нужен node-runner)
7. Какие env / build-args нужны приложению, разделить:
   - публичные (build-arg, secrets GitHub) → запекаются в образ
   - серверные (runtime env) → идут в `.env.prod`
8. Репозиторий публичный или приватный (для GHCR)
9. Имя образа в GHCR (по умолчанию `ghcr.io/<owner>/<repo>`)
10. Любые специфичные системные зависимости в билде (шрифты, бинари — см. грабли #11)

### Шаг 3. Реализация

- Создать ветку (не main).
- Сгенерировать все артефакты.
- Локально прогнать `docker build .` (без push) — убедиться, что образ собирается.
- Закоммитить, открыть PR.
- **Не мержить самостоятельно.**

### Шаг 4. Финальный отчёт + чеклист

В описании PR / последнем сообщении:

**На сервере (выполняет пользователь):**
- [ ] `docker network ls | grep <netname>` — сеть существует
  (если нет → `make init-network` или `docker network create <name>`)
- [ ] nginx-proxy запущен (`docker ps | grep nginx-proxy`).
      Если впервые — `make init-nginxproxy`
- [ ] DNS A-запись домена указывает на IP сервера (`dig +short <domain>`)
- [ ] `.env.prod` заполнен на сервере
- [ ] `make prod-up` отработал без ошибок
- [ ] `docker ps` показывает контейнер приложения **и** Watchtower
- [ ] `docker inspect <app-container> | grep -A3 Networks`
      показывает сеть nginx-proxy
- [ ] `curl -I http://<domain>` → 200/301
- [ ] `https://<domain>` открывается с валидным TLS

**Проверка CI/CD:**
- [ ] PR замержен в main → Action `Deploy` зелёный
- [ ] В GHCR появился свежий образ с тегами `latest` + `sha-<sha>`
- [ ] Через ≤5 мин на сервере `docker inspect <app> --format '{{.Image}}'`
      показывает новый sha
- [ ] `docker logs watchtower --tail 20` содержит «Session done»

**Диагностика, если что-то не так:**
- 502 от nginx-proxy → две частые причины:
  1. **Сеть не совпала** (грабли #1). Проверить `docker network inspect <netname>` —
     должны быть и nginx-proxy, и приложение.
  2. **`VIRTUAL_PORT` ≠ порт, который слушает nginx в образе** (грабли #18). Прокси
     шлёт на `IP:VIRTUAL_PORT`, а приложение слушает другой порт → connection refused.
     Посмотреть, куда реально шлёт прокси:
     `docker exec <proxy> grep -A6 '<domain>' /etc/nginx/conf.d/default.conf`
     (строки `using port` / `server <IP>:<порт>`). Должно совпадать с `listen` в
     `nginx.conf` (для `nginx-unprivileged` — `8080`).
  Частая первопричина второго случая — **серверный `docker-compose.prod.yml` устарел**:
  после PR, меняющего `VIRTUAL_PORT`/порт/сеть (напр. миграция на non-root `:8080`),
  файл на сервере нужно **перекачать** (`curl -fsSLO` той же raw-ссылкой, см. выше) и
  `make prod-up` — иначе на проде остаётся старая маршрутизация на старый порт.
- Watchtower не обновляет → `docker logs watchtower`. Чаще всего грабли #5.
- TLS не выдан → `docker logs <acme-companion>`. Проверить, что DNS
  резолвится с публичного IP, не закеширован старый AAAA, и `LETSENCRYPT_EMAIL`
  задан в `.env.prod` nginx-proxy.
- CI падает на `pnpm install` с cache → грабли #10, нет lockfile.
- Сборка падает на rsvg/inkscape → грабли #11.

---

## Откат, smoke-тест и SHA-пины (issue #52)

**Smoke-тест после деплоя.** `make prod-redeploy` теперь в конце гоняет
`make prod-smoke` — опрашивает контейнер (`wget http://localhost:8080/`, ~15 c,
переживает `start_period` healthcheck). Если приложение не отвечает — команда
падает с ненулевым кодом (сигнал, а не «молчаливый» деплой битого образа).

**Внешний smoke.** `make prod-smoke-external` проверяет публичный домен снаружи
(`curl https://$DOMAIN/ → 200`, `DOMAIN` из `.env.prod`) — весь путь DNS → nginx-proxy
→ TLS → app, чего внутренний `prod-smoke` не ловит (мисконфиг прокси/сети/TLS,
устаревший `docker-compose.prod.yml` на сервере — см. грабли #1/#18). curl валидирует
TLS по умолчанию. Запускать после `prod-redeploy`/`prod-rollback` для полной проверки.

**Откат.** CI тегает каждый образ `sha-<коммит>` (`docker/metadata-action`), тег
**immutable**. Образ в `docker-compose.prod.yml` — `:${APP_IMAGE_TAG:-latest}`,
поэтому откат = `make prod-rollback TAG=sha-<коммит>` (подставит тег, поднимет,
прогонит smoke). Watchtower не трогает immutable sha-тег; вернуть авто-обновление
`latest` — `make prod-redeploy`.

**SHA-пины сторонних GitHub Actions.** В `.github/workflows/ci.yml` все `uses:`
запинены на полный commit-SHA с комментарием `# vX.Y.Z` (иначе мутабельный тег
можно переназначить на вредоносный код). Обновляет Dependabot (ecosystem
`github-actions`, см. `.github/dependabot.yml`) — он бампит и SHA, и комментарий.
Так же **обязательно** пиновать floating-теги образов с доступом к `docker.sock`
(Watchtower, nginx-proxy, acme-companion — уже сделано).

---

## Что НЕ должен делать агент

- Клонировать репозиторий на сервер (использовать curl raw-ссылок).
- Класть `.env.prod` в git.
- Самостоятельно мержить PR в main.
- Молча игнорировать ответ пользователя по имени сети — пересоздавать сеть с
  «правильным» именем без подтверждения.
- Поднимать nginx-proxy второй раз, если он уже стоит (порты 80/443 заняты —
  упадёт весь сервер).
- Использовать `latest` без `sha-<sha>`-тега в metadata-action — без sha
  невозможно откатиться.
