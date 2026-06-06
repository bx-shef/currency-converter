@echo off
REM Ручная проверка PR #32 — Windows.
REM Запуск (двойным кликом или в cmd): scripts\manual-check\check.cmd
REM
REM Скрипт:
REM   1. ставит зависимости (pnpm install)
REM   2. прогоняет lint + typecheck + tests + generate
REM   3. поднимает dev-сервер на http://localhost:3000
REM   4. открывает в браузере три страницы
REM
REM Что должно быть видно глазами:
REM   • http://localhost:3000/              — конвертер; справа в шапке бейдж "Отдельно (без B24)"
REM   • http://localhost:3000/install       — крутится прогресс, потом редирект на /
REM   • http://localhost:3000/widget/converter — компактный конвертер; кнопка "Вставить в чат" серая (disabled)

setlocal
cd /d "%~dp0..\.."

echo === 1/5  pnpm install ===
call pnpm install --frozen-lockfile
if errorlevel 1 goto :err

echo === 2/5  lint ===
call pnpm lint
if errorlevel 1 goto :err

echo === 3/5  typecheck ===
call pnpm typecheck
if errorlevel 1 goto :err

echo === 4/5  tests ===
call pnpm test
if errorlevel 1 goto :err

echo === 5/5  generate (статическая сборка) ===
call pnpm generate
if errorlevel 1 goto :err

echo.
echo Все автопроверки прошли.
echo Сейчас поднимется dev-сервер на http://localhost:3000
echo Откроются три страницы в браузере по умолчанию.
echo.
echo Нажми Ctrl+C, когда закончишь визуальный контроль.
echo.

REM Откроем страницы в браузере (с небольшой задержкой, чтобы сервер успел стартовать)
start "" cmd /c "timeout /t 5 >nul && start http://localhost:3000/ && start http://localhost:3000/install && start http://localhost:3000/widget/converter"

call pnpm dev
goto :eof

:err
echo.
echo *** Ошибка на шаге выше. Проверка прервана. ***
exit /b 1
