# One-shot verifier for the P0 tooling on Windows (PowerShell).
# Run it and read the result:  pwsh scripts/verify-tooling.ps1
$ErrorActionPreference = "Stop"
Set-Location (& git rev-parse --show-toplevel)

Write-Host "== 1. session-start.sh: bash syntax (needs bash: WSL/Git Bash) =="
if (Get-Command bash -ErrorAction SilentlyContinue) {
    bash -n .claude/hooks/session-start.sh
    if ($LASTEXITCODE -ne 0) { throw "session-start.sh syntax error" }
    Write-Host "OK"
} else {
    Write-Host "SKIP: bash not found"
}

Write-Host "== 2. package.json: scripts.check has lint+typecheck+test =="
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
if (-not $pkg.scripts.check) { throw "FAIL: no scripts.check" }
foreach ($w in @("lint","typecheck","test")) {
    if ($pkg.scripts.check -notlike "*$w*") { throw "FAIL: check missing $w" }
}
Write-Host "OK: $($pkg.scripts.check)"

Write-Host "== 3. pnpm check (lint && typecheck && test) =="
pnpm check
if ($LASTEXITCODE -ne 0) { throw "pnpm check failed" }

Write-Host "ALL CHECKS PASSED"
