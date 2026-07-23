.PHONY: dev prod-up prod-down prod-pull prod-redeploy prod-smoke prod-smoke-external \
        prod-rollback logs init-network init-nginxproxy

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

## Внешний smoke: публичный домен реально отвечает 200 по HTTPS — проверяет весь
## путь снаружи (DNS → nginx-proxy → TLS → app), в отличие от prod-smoke (тот
## опрашивает контейнер изнутри и не ловит проблемы прокси/TLS/DNS). DOMAIN берётся
## из .env.prod (без исполнения файла — grep). curl валидирует TLS по умолчанию.
prod-smoke-external:
	@test -f .env.prod || { echo "нет .env.prod (нужен DOMAIN)"; exit 1; }
	@DOMAIN=$$(grep -E '^DOMAIN=' .env.prod | head -1 | cut -d= -f2- | tr -d '\r'); \
	test -n "$$DOMAIN" || { echo "DOMAIN не задан в .env.prod"; exit 1; }; \
	code=$$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$$DOMAIN/" || echo 000); \
	if [ "$$code" = "200" ]; then echo "✓ внешний smoke OK — https://$$DOMAIN/ → 200"; else \
		echo "✗ внешний smoke FAILED — https://$$DOMAIN/ → $$code (DNS/TLS/proxy? см. make logs)"; exit 1; fi

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
