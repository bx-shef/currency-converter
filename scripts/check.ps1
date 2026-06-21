# One-shot pre-push check for Windows (PowerShell): runs the same gates as CI and
# prints a pass/fail summary. Run it and share the output — no need to type commands.
#   Usage:  powershell -ExecutionPolicy Bypass -File scripts\check.ps1
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')

$fail = 0
$results = @()

function Step([string]$name, [string]$cmd) {
    Write-Host ""
    Write-Host "> $name"
    & cmd /c $cmd
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK  $name"
        $script:results += "OK   $name"
    } else {
        Write-Host "FAIL $name (exit $LASTEXITCODE)"
        $script:results += "FAIL $name"
        $script:fail = 1
    }
}

Write-Host "=== currency-converter: pre-push check ==="
node -v
pnpm -v

Step "install"   "pnpm install --frozen-lockfile"
Step "lint"      "pnpm lint"
Step "typecheck" "pnpm typecheck"
Step "test"      "pnpm test"
Step "generate"  "pnpm generate"

Write-Host ""
Write-Host "=== summary ==="
$results | ForEach-Object { Write-Host $_ }
if ($fail -eq 0) {
    Write-Host "ALL GREEN"
} else {
    Write-Host "SOME CHECKS FAILED"
}
exit $fail
