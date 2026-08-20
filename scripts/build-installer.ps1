$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$npmExecutable = (Get-Command npm.cmd -ErrorAction Stop).Source
$package = Get-Content -Raw -Encoding utf8 -LiteralPath 'package.json' | ConvertFrom-Json
$distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$versionOutput = [IO.Path]::GetFullPath((Join-Path $distRoot $package.version))
$buildOutput = [IO.Path]::GetFullPath((Join-Path $distRoot "installer-build-$PID"))
$installerName = "Yuvis-Music-$($package.version)-x64.exe"
$builtInstaller = Join-Path $buildOutput $installerName
$finalInstaller = [IO.Path]::GetFullPath((Join-Path $versionOutput $installerName))

foreach ($target in @($versionOutput, $buildOutput, $finalInstaller)) {
  if (-not $target.StartsWith("$distRoot$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Installer output escaped dist directory: $target"
  }
}

& $npmExecutable exec -- electron-builder --win nsis "--config.directories.output=$buildOutput"
if ($LASTEXITCODE -ne 0) {
  throw "Installer build failed with exit code $LASTEXITCODE"
}

$fileReadyDeadline = (Get-Date).AddSeconds(90)
while (-not (Test-Path -LiteralPath $builtInstaller -PathType Leaf) -and (Get-Date) -lt $fileReadyDeadline) {
  Start-Sleep -Milliseconds 500
}
if (-not (Test-Path -LiteralPath $builtInstaller -PathType Leaf)) {
  throw "Installer executable was not created: $builtInstaller"
}

New-Item -ItemType Directory -Path $versionOutput -Force | Out-Null
Copy-Item -LiteralPath $builtInstaller -Destination $finalInstaller -Force
$installerFile = Get-Item -LiteralPath $finalInstaller
Write-Host "Installer complete: $($installerFile.FullName) ($($installerFile.Length) bytes)"

if (Test-Path -LiteralPath $buildOutput) {
  try {
    Remove-Item -LiteralPath $buildOutput -Recurse -Force
  } catch {
    Write-Warning "Unable to clean temporary installer build directory: $buildOutput"
  }
}
