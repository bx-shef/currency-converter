#!/usr/bin/env bash
# Ручная проверка PR #32 — Linux/macOS.
# Запуск: bash scripts/manual-check/check.sh
#
# Скрипт:
#   1. ставит зависимости (pnpm install)
#   2. прогоняет lint + typecheck + tests + generate
#   3. поднимает dev-сервер на http://localhost:3000
#   4. открывает три страницы и ждёт визуального контроля
#
# Что должно быть видно глазами:
#   • http://localhost:3000/              — конвертер; справа в шапке бейдж «Отдельно (без B24)»
#   • http://localhost:3000/install       — крутится прогресс, потом редирект на /
#   • http://localhost:3000/widget/converter — компактный конвертер; кнопка «Вставить в чат» серая (disabled)

set -e
cd "$(dirname "$0")/../.."

echo "=== 1/5  pnpm install ==="
pnpm install --frozen-lockfile

echo "=== 2/5  lint ==="
pnpm lint

echo "=== 3/5  typecheck ==="
pnpm typecheck

echo "=== 4/5  tests ==="
pnpm test

echo "=== 5/5  generate (статическая сборка) ==="
pnpm generate

echo
echo "Все автопроверки прошли."
echo "Сейчас поднимется dev-сервер на http://localhost:3000"
echo "Открой в браузере три ссылки:"
echo "  http://localhost:3000/"
echo "  http://localhost:3000/install"
echo "  http://localhost:3000/widget/converter"
echo
echo "Нажми Ctrl+C, когда закончишь визуальный контроль."
echo
pnpm dev
