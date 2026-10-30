# Field CRM: установка всего нужного и создание проектов crm и mobile.
# Запуск: правый клик по файлу -> "Выполнить с помощью PowerShell"
# или в PowerShell из папки field-crm:  powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

function Install-IfMissing($cmd, $wingetId, $title) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) {
    Write-Host "[ok] $title уже установлен" -ForegroundColor Green
  } else {
    Write-Host "[..] Ставлю $title" -ForegroundColor Yellow
    winget install --id $wingetId -e --accept-package-agreements --accept-source-agreements
    Refresh-Path
  }
}

Write-Host "`n=== 1. Программы ===" -ForegroundColor Cyan
Install-IfMissing "node" "OpenJS.NodeJS.LTS" "Node.js LTS"
Install-IfMissing "git"  "Git.Git"           "Git"

$studio = "$env:ProgramFiles\Android\Android Studio\bin\studio64.exe"
if (Test-Path $studio) {
  Write-Host "[ok] Android Studio уже установлен" -ForegroundColor Green
} else {
  Write-Host "[..] Ставлю Android Studio (большой, несколько минут)" -ForegroundColor Yellow
  winget install --id Google.AndroidStudio -e --accept-package-agreements --accept-source-agreements
}

node -v
npm -v

Write-Host "`n=== 2. Веб-CRM (crm) ===" -ForegroundColor Cyan
if (-not (Test-Path ".\crm\package.json")) {
  npm create vite@latest crm -- --template react-ts
}
Push-Location crm
npm install
npm install @supabase/supabase-js react-router-dom
if (-not (Test-Path ".env.local")) {
  [IO.File]::WriteAllText("$PWD\.env.local", "VITE_SUPABASE_URL=`nVITE_SUPABASE_ANON_KEY=`n")
}
Pop-Location

Write-Host "`n=== 3. Мобилка (mobile) ===" -ForegroundColor Cyan
if (-not (Test-Path ".\mobile\package.json")) {
  npx --yes create-expo-app@latest mobile --template blank-typescript
}
Push-Location mobile
npx expo install expo-location expo-task-manager expo-notifications expo-camera expo-image-picker expo-sqlite expo-dev-client
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
if (-not (Test-Path ".env")) {
  [IO.File]::WriteAllText("$PWD\.env", "EXPO_PUBLIC_SUPABASE_URL=`nEXPO_PUBLIC_SUPABASE_ANON_KEY=`n")
}
Pop-Location

Write-Host "`n=== Готово ===" -ForegroundColor Green
Write-Host "Открой Android Studio один раз: он докачает Android SDK (мастер первого запуска, жми Next)."
Write-Host "Ключи Supabase впиши в crm\.env.local и mobile\.env."
Read-Host "Нажми Enter, чтобы закрыть"
