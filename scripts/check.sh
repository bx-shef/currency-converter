#!/usr/bin/env bash
# One-shot pre-push check for Linux/macOS: runs the same gates as CI and prints a
# pass/fail summary. Run it and share the output — no need to type commands.
#   Usage:  bash scripts/check.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

fail=0
declare -a results=()

step() {
  local name="$1"; shift
  echo ""
  echo "▶ $name"
  if "$@"; then
    echo "✅ $name"
    results+=("✅ $name")
  else
    echo "❌ $name (exit $?)"
    results+=("❌ $name")
    fail=1
  fi
}

echo "=== currency-converter: pre-push check ==="
node -v 2>/dev/null && pnpm -v 2>/dev/null

step "install"   pnpm install --frozen-lockfile
step "lint"      pnpm lint
step "typecheck" pnpm typecheck
step "test"      pnpm test
step "generate"  pnpm generate

echo ""
echo "=== summary ==="
printf '%s\n' "${results[@]}"
if [ "$fail" -eq 0 ]; then
  echo "ALL GREEN ✅"
else
  echo "SOME CHECKS FAILED ❌"
fi
exit "$fail"
