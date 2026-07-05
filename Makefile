.PHONY: dev prod-up prod-down prod-pull prod-redeploy prod-smoke prod-rollback \
        logs init-network init-nginxproxy

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

## Принудительно обновить прямо сейчас (без ожидания Watchtower) + smoke-тест
prod-redeploy:
	docker compose -f docker-compose.prod.yml --env-file .env.prod pull && \
	docker compose -f docker-compose.prod.yml --env-file .env.prod up -d && \
	docker image prune -f && \
	$(MAKE) prod-smoke

## Smoke-тест: приложение реально отвечает на :8080 (issue #52 P1).
## Опрашивает контейнер ~15 c (переживает start_period healthcheck).
prod-smoke:
	@for i in 1 2 3 4 5; do \
		docker compose -f docker-compose.prod.yml exec -T app wget -qO- http://localhost:8080/ >/dev/null 2>&1 \
			&& { echo "✓ smoke OK — приложение отвечает"; exit 0; }; \
		echo "…ждём приложение ($$i/5)"; sleep 3; \
	done; \
	echo "✗ smoke FAILED — см. make logs"; exit 1

## Откат на конкретный immutable-образ: make prod-rollback TAG=sha-<коммит> (issue #52 P1).
## Тег sha-<коммит> пишет CI (docker/metadata-action). Watchtower не трогает
## immutable sha-тег; вернуть авто-обновление latest — make prod-redeploy.
prod-rollback:
	@test -n "$(TAG)" || { echo "укажите TAG=sha-<коммит> (тег образа из GHCR / вкладки Actions)"; exit 1; }
	APP_IMAGE_TAG=$(TAG) docker compose -f docker-compose.prod.yml --env-file .env.prod pull
	APP_IMAGE_TAG=$(TAG) docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
	@$(MAKE) prod-smoke
	@echo "Откат на $(TAG) выполнен. Вернуть latest + авто-обновление — make prod-redeploy."

logs:
	docker compose -f docker-compose.prod.yml logs -f app
