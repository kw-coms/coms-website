$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$jdkPath = Join-Path $repoRoot ".tools\jdk-21.0.11+10"
$backendPath = Join-Path $repoRoot "backend"

if (-not (Test-Path $jdkPath)) {
    throw "Local JDK not found at $jdkPath. Install or extract JDK 21 there before running backend tests."
}

$env:JAVA_HOME = (Resolve-Path $jdkPath).Path
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Push-Location $backendPath
try {
    java -version
    .\gradlew.bat test
}
finally {
    Pop-Location
}
