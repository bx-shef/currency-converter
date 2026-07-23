# Эксплуатация (runbook)

> Last reviewed: 2026-07-23

Что делать после того, как приложение уже в проде. Первоначальная настройка деплоя —
в [`AI_DEPLOY_GUIDE.md`](AI_DEPLOY_GUIDE.md) (там же «грабли» #1–#24); здесь — рутина и инциденты.

**Схема прода:** статика (SSG) в образе `nginxinc/nginx-unprivileged:8080` → GHCR → Watchtower
(поллинг ~5 мин) подхватывает `latest` → за общим `nginx-proxy` (TLS Let's Encrypt).

## Регулярный мониторинг

| Что | Как проверить | Норма / порог |
|---|---|---|
| Доступность снаружи | `make prod-smoke-external` (curl `https://$DOMAIN/`) | `200`, валидный TLS |
| Контейнер жив | `docker ps` → статус `healthy` (healthcheck `wget :8080`, 30s) | `Up (healthy)` |
| TLS-сертификат | `echo \| openssl s_client -connect $DOMAIN:443 2>/dev/null \| openssl x509 -noout -enddate` | обновить/проверить, если **< 14 дней** |
| Свежесть деплоя | `docker inspect currency-converter --format '{{.Image}}'` → sha | совпадает с последним коммитом main |
| Watchtower | `docker logs watchtower --tail 20` | периодические «Session done» |
| Диск | `docker system df` | логи капнуты (json-file 10m×3); при росте — `docker image prune -f` |

TLS продлевается автоматически (`acme-companion`); ручное вмешательство нужно только если
продление **не** происходит (см. «Инциденты»).

## Обновление и откат

- **Обычное обновление** — автоматически: merge в `main` → CI пушит образ в GHCR → Watchtower
  подхватывает за ~5 мин. Форсировать сейчас: `make prod-redeploy` (pull + up + prune + `prod-smoke`).
- **Откат** на конкретный образ: `make prod-rollback TAG=sha-<коммит>` (immutable sha-тег из
  CI/GHCR; поднимает + гоняет `prod-smoke`). Вернуть авто-обновление `latest` — `make prod-redeploy`.
- **После отката/редеплоя** — обязательно `make prod-smoke-external` (полный путь снаружи).

## Логи

- Приложение: `make logs` (`docker compose logs -f app`).
- Watchtower: `docker logs watchtower`.
- acme-companion (TLS): `docker logs <acme-companion>`.
- Ротация: json-file `max-size 10m`, `max-file 3` (app и watchtower) — диск не забьётся.

## Инциденты

| Симптом | Первая гипотеза | Что делать |
|---|---|---|
| `502` от nginx-proxy | сеть не совпала (грабли #1) или `VIRTUAL_PORT`≠порт (#18) | `docker network inspect <net>` (оба контейнера?); перекачать `docker-compose.prod.yml` (`curl -fsSLO`), `make prod-up` |
| Белый экран в портале Б24, `405/Mixed-Content` | `error_page 405`/`absolute_redirect` (#20/#21) | проверить `nginx.conf` в образе; пересобрать |
| TLS не выдан/не продлён | DNS/rate-limit (#14) | `docker logs <acme-companion>`; проверить `dig +short $DOMAIN`, `LETSENCRYPT_EMAIL` |
| Watchtower не обновляет | `DOCKER_API_VERSION` (#5) / нет label | `docker logs watchtower`; label `com.centurylinklabs.watchtower.enable=true` |
| Курсы не грузятся у всех | `api.nbrb.by` недоступен (SPOF, issue #80) | внешняя проблема НБ РБ; кэш `localStorage` спасает вернувшихся, но не первую загрузку |
| Сборка/деплой красные | см. CI (`ci`→`deploy`); красный `ci` блокирует пуш образа | смотреть Actions; грабли #10 (lockfile), #11 (inkscape), #17 (node major) |

## Здоровье приложения (телеметрия)

Health-сигналы уходят в Яндекс.Метрику (только standalone) — см. [`DATA_POLICY.md`](DATA_POLICY.md) §3:
`rates_load_failed` (сбой API курсов), `rates_monthly_missing` (частичная деградация),
`web_vitals_*` (производительность). Рост `rates_load_failed` = проблема с `api.nbrb.by`.

## Что НЕ трогать без нужды

- Пины образов (watchtower/nginx-proxy/acme-companion) — supply-chain (грабли #6).
- SHA-пины actions в `ci.yml` — обновляет Dependabot.
- `.env.prod` на сервере — не в git; при смене домена/портов перекачать compose и `make prod-up`.
