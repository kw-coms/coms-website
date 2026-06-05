$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$jdkPath = Join-Path $repoRoot ".tools\jdk-21.0.11+10"
$backendPath = Join-Path $repoRoot "backend"

if (-not (Test-Path $jdkPath)) {
    throw "Local JDK not found at $jdkPath. Install or extract JDK 21 there before running the backend."
}

$env:JAVA_HOME = (Resolve-Path $jdkPath).Path
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:SPRING_PROFILES_ACTIVE = "dev"

Push-Location $backendPath
try {
    .\gradlew.bat bootRun
}
finally {
    Pop-Location
}
