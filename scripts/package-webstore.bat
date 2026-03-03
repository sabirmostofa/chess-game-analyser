@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "OUT_ZIP=%ROOT_DIR%\lichess-importer-webstore.zip"

if exist "%OUT_ZIP%" del /f /q "%OUT_ZIP%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = Resolve-Path '%ROOT_DIR%';" ^
  "$out = Join-Path $root 'lichess-importer-webstore.zip';" ^
  "$files = @(" ^
  "  'manifest.json'," ^
  "  'background.js'," ^
  "  'popup.html'," ^
  "  'popup.js'," ^
  "  'popup.css'," ^
  "  'options.html'," ^
  "  'options.js'," ^
  "  'options.css'," ^
  "  'chooser.html'," ^
  "  'chooser.js'," ^
  "  'chooser.css'," ^
  "  'icons\icon16.png'," ^
  "  'icons\icon32.png'," ^
  "  'icons\icon48.png'," ^
  "  'icons\icon128.png'" ^
  ");" ^
  "$paths = @();" ^
  "foreach ($rel in $files) { $p = Join-Path $root $rel; if (!(Test-Path -LiteralPath $p)) { throw \"Missing required file: $rel\" }; $paths += $p };" ^
  "Compress-Archive -LiteralPath $paths -DestinationPath $out -Force;"

if errorlevel 1 (
  echo Failed to create webstore ZIP.
  exit /b 1
)

echo Created: %OUT_ZIP%
endlocal
