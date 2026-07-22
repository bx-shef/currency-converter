#!/usr/bin/env bash
# In Claude Code web/agent sessions, prepare the repo so lint/typecheck/test/generate
# work from the first turn (mirrors ai-price-import / client-bank-alfa-by).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

corepack enable >/dev/null 2>&1 || true

# Best-effort prep, but report the TRUTH: track whether each step actually
# succeeded instead of always printing "done". `timeout` keeps a hung network
# from blocking session start (fail-open); the hook never aborts the session.
ok=1

# Prefer a reproducible install. If the lockfile is out of sync, fall back to a
# plain install so the session still starts — but surface it (this fallback can
# rewrite pnpm-lock.yaml), don't hide the drift behind /dev/null.
if ! timeout 120 pnpm install --frozen-lockfile >/dev/null 2>&1; then
  echo "session-start: lockfile out of sync — retrying without --frozen-lockfile (may change pnpm-lock.yaml)"
  timeout 120 pnpm install >/dev/null 2>&1 || ok=0
fi
timeout 60 pnpm nuxt prepare >/dev/null 2>&1 || ok=0

if [ "$ok" -eq 1 ]; then
  echo "session-start: deps installed, nuxt prepared"
else
  echo "session-start: WARNING — setup incomplete (offline? install/prepare failed); lint/typecheck/test may not run"
fi
