.PHONY: dev prod-up prod-down prod-pull prod-redeploy logs \
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

## Принудительно обновить прямо сейчас (без ожидания Watchtower)
prod-redeploy:
	docker compose -f docker-compose.prod.yml --env-file .env.prod pull && \
	docker compose -f docker-compose.prod.yml --env-file .env.prod up -d && \
	docker image prune -f

logs:
	docker compose -f docker-compose.prod.yml logs -f app
