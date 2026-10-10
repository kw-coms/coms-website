$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$jdkCandidates = @(
    $env:JAVA_HOME,
    (Join-Path $repoRoot ".tools\jdk-21.0.11+10"),
    (Join-Path $env:LOCALAPPDATA "coms-tools\jdk21\jdk-21.0.12.1+1")
)
$jdkPath = $jdkCandidates | Where-Object { $_ -and (Test-Path (Join-Path $_ "bin\java.exe")) } | Select-Object -First 1
$backendPath = Join-Path $repoRoot "backend"

if (-not $jdkPath) {
    throw "JDK 21 not found. Set JAVA_HOME or install JDK 21 in .tools."
}

$env:JAVA_HOME = (Resolve-Path $jdkPath).Path
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:SPRING_PROFILES_ACTIVE = "dev"
if (-not $env:JWT_SECRET) {
    $env:JWT_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
}

Push-Location $backendPath
try {
    .\gradlew.bat bootRun
}
finally {
    Pop-Location
}
