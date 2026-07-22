@echo off
REM One-shot verifier for the P0 tooling on Windows (cmd.exe fallback,
REM no PowerShell execution-policy needed):  scripts\verify-tooling.bat
setlocal

echo == package.json: scripts.check has lint+typecheck+test ==
call node -e "const s=require('./package.json').scripts; if(!s.check){console.error('FAIL: no scripts.check');process.exit(1);} for(const w of ['lint','typecheck','test']){if(!s.check.includes(w)){console.error('FAIL: check missing '+w);process.exit(1);}} console.log('OK: '+s.check);"
if errorlevel 1 exit /b 1

echo == pnpm check (lint ^&^& typecheck ^&^& test) ==
call pnpm check
if errorlevel 1 (
    echo FAILED: pnpm check
    exit /b 1
)

echo ALL CHECKS PASSED
