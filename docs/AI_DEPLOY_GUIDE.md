# Инструкция AI-агенту: деплой через GHCR + Watchtower + nginx-proxy

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
3. **`.github/workflows/ci.yml`** — на каждый PR: install → build → typecheck.
4. **`.github/workflows/deploy.yml`** — на `push: main`:
   `docker/login-action@v3` (GHCR), `docker/build-push-action@v6`,
   теги `latest` + `sha-<sha>`, cache `type=gha`, `permissions: packages: write`.
5. **`docker-compose.prod.yml`** — приложение (`image: ghcr.io/...`) + Watchtower,
   сеть как `external: true`, label-enable.
6. **`docker-compose.nginxproxy.yml`** — `nginxproxy/nginx-proxy` + `acme-companion`.
   Включается, **только если на сервере nginx-proxy ещё не стоит**.
7. **`.env.prod.example`** — `DOMAIN`, `LETSENCRYPT_EMAIL` (+ runtime env приложения,
   если есть). Реальный `.env.prod` лежит на сервере, не в git.
8. **`Makefile`** — `prod-up`, `prod-down`, `prod-redeploy`, `logs`,
   `init-network`, `init-nginxproxy`.
9. **`README.md`** — раздел Deploy: ссылки на raw-URL файлов и команды для сервера.

---

## Что лежит на сервере

```
/home/<user>/<project>/
├── docker-compose.prod.yml
├── docker-compose.nginxproxy.yml   # только если nginx-proxy ещё не развернут
├── .env.prod                        # не в git
└── Makefile                         # опционально
```

**Git на сервер не клонируется.** Файлы качаются напрямую через curl из raw-ссылок:

```bash
mkdir -p /home/<user>/<project> && cd $_
BASE="https://raw.githubusercontent.com/<owner>/<repo>/main"
for f in docker-compose.prod.yml Makefile .env.prod.example; do
  curl -fsSLO "$BASE/$f"
done
# (nginxproxy.yml — только если ставите proxy впервые)
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

4. **`container_name` задавать.** Watchtower и удобство `docker logs` его требуют.

5. **Watchtower → `DOCKER_API_VERSION=1.47`.** `containrrr/watchtower:latest`
   по умолчанию говорит на Docker API 1.25, daemon 24+ требует ≥1.44.
   Без переменной Watchtower молча не работает.

6. **Watchtower по умолчанию обновляет ВСЕ контейнеры на хосте.**
   Команда: `--interval 300 --cleanup --label-enable`.
   На приложении: `labels: ["com.centurylinklabs.watchtower.enable=true"]`.

7. **GHCR push требует `permissions: packages: write`** в workflow.
   `GITHUB_TOKEN` встроенный, отдельный PAT не нужен.

8. **Build-args vs runtime env.** Для Nuxt/Vite/Next и любых SSG/SPA публичные
   переменные «запекаются» в бандл при сборке → передавать через `build-args`
   в workflow и `ARG`/`ENV` в Dockerfile, **не** через `environment:` в compose.
   Runtime env (серверная часть, секреты сервера) — в `.env.prod` на сервере.

9. **Lockfile нужен для CI cache.** Без `pnpm-lock.yaml` / `package-lock.json`
   нельзя включить `cache: 'pnpm'` в `setup-node` — упадёт. Сгенерировать
   локально и закоммитить **до** включения кеша. Не пытаться чинить через PR
   на стороне сервера.

10. **`rsvg-convert` удалён в librsvg 2.57+.** Если в Dockerfile нужна
    SVG→PNG конвертация (OG-картинки) — на Alpine 3.21 (`node:20-alpine`)
    `rsvg-convert` уже нет. Использовать `inkscape`:
    `apk add inkscape font-dejavu fontconfig && fc-cache -f`. Либо рендерить
    OG через библиотеку (Satori), без системного бинаря.

11. **Публичный репозиторий → публичный GHCR-образ → `docker login` на сервере
    не нужен.** Приватный → нужен PAT с `read:packages`.

12. **`docker compose up` без `--env-file .env.prod`** не подхватит переменные.
    В Makefile прописывать `--env-file .env.prod` для каждого compose-вызова.

13. **DNS должен быть готов ДО первого запуска acme-companion** — иначе
    Let's Encrypt не сможет валидировать и закеширует rate-limit на час.

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
10. Любые специфичные системные зависимости в билде (шрифты, бинари — см. грабли #10)

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
- 502 от nginx-proxy → сеть не совпала (грабли #1). Проверить
  `docker network inspect <netname>`, должен быть и nginx-proxy, и приложение.
- Watchtower не обновляет → `docker logs watchtower`. Чаще всего грабли #5.
- TLS не выдан → `docker logs <acme-companion>`. Проверить, что DNS
  резолвится с публичного IP, не закеширован старый AAAA, и `LETSENCRYPT_EMAIL`
  задан в `.env.prod` nginx-proxy.
- CI падает на `pnpm install` с cache → грабли #9, нет lockfile.
- Сборка падает на rsvg/inkscape → грабли #10.

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
