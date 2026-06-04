.PHONY: dev prod-up prod-down prod-pull prod-redeploy prod-rollback logs \
        init-network init-nginxproxy

# ─── Локальная разработка ────────────────────────────────────────────

dev:
	pnpm dev

# ─── Первоначальная настройка сервера (один раз) ─────────────────────

## Создать docker-сеть для nginx-proxy
init-network:
	docker network create proxy-net 2>/dev/null || true

## Запустить nginx-proxy + Let's Encrypt companion
init-nginxproxy:
	docker compose -f docker-compose.nginxproxy.yml --env-file .env.prod up -d

# ─── Управление приложением ────────────────────────────────────

## Запустить приложение + Watchtower
prod-up:
	docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

prod-down:
	docker compose -f docker-compose.prod.yml down

## Скачать свежий образ (без перезапуска контейнера)
prod-pull:
	docker compose -f docker-compose.prod.yml --env-file .env.prod pull

## Принудительно обновить прямо сейчас (без ожидания Watchtower)
prod-redeploy:
	docker compose -f docker-compose.prod.yml --env-file .env.prod pull && \
	docker compose -f docker-compose.prod.yml --env-file .env.prod up -d && \
	docker image prune -f

## Откат на конкретный прошлый образ: make prod-rollback TAG=sha-abc1234
## Пинит APP_TAG; контейнер встаёт на этот (неизменный) тег, и Watchtower
## перестаёт его трогать. Вернуть авто-деплой с latest: make prod-redeploy.
prod-rollback:
	@test -n "$(TAG)" || { echo "Usage: make prod-rollback TAG=sha-<commit>"; exit 1; }
	APP_TAG=$(TAG) docker compose -f docker-compose.prod.yml --env-file .env.prod pull app && \
	APP_TAG=$(TAG) docker compose -f docker-compose.prod.yml --env-file .env.prod up -d app

logs:
	docker compose -f docker-compose.prod.yml logs -f app
