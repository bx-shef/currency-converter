#!/usr/bin/env bash
# One-shot verifier for the P0 tooling (SessionStart hook + `pnpm check` alias).
# Run it and read the result — no need to remember individual commands:
#   bash scripts/verify-tooling.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== 1. session-start.sh: bash syntax =="
bash -n .claude/hooks/session-start.sh && echo "OK"

echo "== 2. session-start.sh: executable bit =="
[ -x .claude/hooks/session-start.sh ] && echo "OK" || { echo "FAIL: not executable"; exit 1; }

echo "== 3. gate closed (no CLAUDE_CODE_REMOTE) => no-op, no output =="
out="$(env -u CLAUDE_CODE_REMOTE bash .claude/hooks/session-start.sh)"
[ -z "$out" ] && echo "OK" || { echo "FAIL: unexpected output: $out"; exit 1; }

echo "== 4. package.json: scripts.check has lint+typecheck+test =="
node -e "
const s = require('./package.json').scripts;
if (!s.check) { console.error('FAIL: no scripts.check'); process.exit(1); }
for (const w of ['lint','typecheck','test']) {
  if (!s.check.includes(w)) { console.error('FAIL: check missing ' + w); process.exit(1); }
}
console.log('OK: ' + s.check);
"

echo "== 5. pnpm check (lint && typecheck && test) =="
pnpm check

echo "ALL CHECKS PASSED"
