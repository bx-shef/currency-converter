#!/usr/bin/env bash
# In Claude Code web/agent sessions, prepare the repo so lint/typecheck/test/generate
# work from the first turn (mirrors ai-price-import / client-bank-alfa-by).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1 || true
pnpm nuxt prepare >/dev/null 2>&1 || true
echo "session-start: deps installed, nuxt prepared"
