# Gera o APK de depuracao do Bate Ofertas, de ponta a ponta:
#   site (app/, VITE_BASE=./) -> android-app/www -> cap sync -> gradle assembleDebug -> saida\bate-ofertas-debug.apk
# Uso:  powershell -ExecutionPolicy Bypass -File construir-apk.ps1
#        ... -Release  tambem gera o APK assinado (saida\bate-ofertas.apk) e o AAB (saida\bate-ofertas.aab);
#                      exige chaves\keystore.properties; versao em versao.json (suba o versionCode a cada release)
param([switch]$Release)
$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
$raiz = Split-Path $aqui -Parent

# Ambiente (so completa o que faltar; tudo no D:, nada novo no C:)
if (-not $env:ANDROID_HOME)     { $env:ANDROID_HOME = 'D:\ferramentas\android-sdk' }
if (-not $env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME }
if (-not $env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME = 'D:\Cache\gradle' }
if (-not $env:ANDROID_USER_HOME){ $env:ANDROID_USER_HOME = 'D:\Cache\android' }
# Capacitor 8 pede JDK 21 (o JDK 17 antigo da maquina nao serve para este projeto)
$jdk21 = Get-ChildItem 'D:\ferramentas\jdk-21' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if ($jdk21) { $env:JAVA_HOME = $jdk21.FullName } elseif (-not $env:JAVA_HOME) { throw 'JDK 21 nao encontrado em D:\ferramentas\jdk-21.' }
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
foreach ($n in 'D:\Arquivos de Programas\Node', 'D:\ferramentas\node') { if (Test-Path $n) { $env:Path = "$n;$env:Path" } }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node nao encontrado.' }
if (-not (Test-Path $env:ANDROID_HOME)) { throw "SDK do Android nao encontrado em $env:ANDROID_HOME (veja apoio\config-claude\android-no-d.md)." }

function Passo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Rodar($exe, $argumentos) { & $exe @argumentos; if ($LASTEXITCODE -ne 0) { throw "Falhou: $exe $($argumentos -join ' ')" } }

Passo '1/4 Dependencias'
if (-not (Test-Path "$raiz\app\node_modules")) { Push-Location "$raiz\app"; Rodar 'npm.cmd' @('ci'); Pop-Location }
Push-Location $aqui
if (-not (Test-Path "$aqui\node_modules")) { Rodar 'npm.cmd' @('ci') }

Passo '2/4 Site do app (caminhos relativos, dados da internet)'
Rodar 'node' @('scripts\build-site.mjs')

Passo '3/4 Capacitor (copiar o site para o Android)'
if (-not (Test-Path "$aqui\android")) { Rodar 'npx.cmd' @('cap', 'add', 'android') }
Rodar 'npx.cmd' @('cap', 'sync', 'android')
# o Gradle precisa saber onde esta o SDK
"sdk.dir=$($env:ANDROID_HOME.Replace([string][char]92, '/'))" | Set-Content -Encoding ascii "$aqui\android\local.properties"

Passo '4/4 Gradle (APK de depuracao)'
Push-Location "$aqui\android"
Rodar '.\gradlew.bat' @('assembleDebug', '--no-daemon')
if ($Release) {
    if (-not (Test-Path "$aqui\chaves\keystore.properties")) { throw 'Falta chaves\keystore.properties (veja apoio\config-claude\android-no-d.md).' }
    Passo 'Gradle (release assinado: APK + AAB)'
    Rodar '.\gradlew.bat' @('assembleRelease', 'bundleRelease', '--no-daemon')
}
Pop-Location

$apk = "$aqui\android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) { throw "APK nao encontrado: $apk" }
New-Item -ItemType Directory -Force "$aqui\saida" | Out-Null
Copy-Item $apk "$aqui\saida\bate-ofertas-debug.apk" -Force
if ($Release) {
    $rel = "$aqui\android\app\build\outputs\apk\release\app-release.apk"
    $aab = "$aqui\android\app\build\outputs\bundle\release\app-release.aab"
    foreach ($f in $rel, $aab) { if (-not (Test-Path $f)) { throw "Nao gerado: $f" } }
    Copy-Item $rel "$aqui\saida\bate-ofertas.apk" -Force
    Copy-Item $aab "$aqui\saida\bate-ofertas.aab" -Force
    Write-Host "Release: $aqui\saida\bate-ofertas.apk e bate-ofertas.aab" -ForegroundColor Green
}
Pop-Location
Write-Host "`nPronto: $aqui\saida\bate-ofertas-debug.apk" -ForegroundColor Green
