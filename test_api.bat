@echo off
REM ============================================================
REM  test_api.bat - Smoke test des endpoints API principaux
REM  Le serveur doit etre en cours d'execution sur :8000
REM ============================================================

setlocal enabledelayedexpansion

echo === Smoke test API PCB Flow Production Suite ===
echo.

set ENDPOINTS=^
/api/health ^
/api/bom/files ^
/api/bom/components?limit=5 ^
/api/bom/categories ^
/api/marketplace/productions ^
/api/marketplace/machines ^
/api/marketplace/carts ^
/api/marketplace/feeder-types ^
/api/reports/overview

set OK=0
set FAIL=0

for %%E in (%ENDPOINTS%) do (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:8000%%E' -TimeoutSec 5 -UseBasicParsing; Write-Host ('  [OK ' + $r.StatusCode + ']') -NoNewline; Write-Host (' %%E') } catch { Write-Host ('  [FAIL' + $_.Exception.Response.StatusCode.value__ + ']') -NoNewline; Write-Host (' %%E ' + $_.Exception.Message) }"
)

echo.
echo === Termine ===
pause
