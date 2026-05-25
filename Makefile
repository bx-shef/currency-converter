.PHONY: dev prod-up prod-down prod-pull logs

# Локальная разработка
dev:
	pnpm dev

# Продакшнный сервер (GHCR образ)
prod-pull:
	docker compose -f docker-compose.prod.yml pull

prod-up:
	docker compose -f docker-compose.prod.yml up -d

prod-down:
	docker compose -f docker-compose.prod.yml down

logs:
	docker compose -f docker-compose.prod.yml logs -f app

# Перезапустить с принудительным обновлением сейчас
prod-redeploy:
	docker compose -f docker-compose.prod.yml pull && \
	docker compose -f docker-compose.prod.yml up -d && \
	docker image prune -f
