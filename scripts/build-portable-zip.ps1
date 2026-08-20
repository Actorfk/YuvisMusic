$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$npmExecutable = (Get-Command npm.cmd -ErrorAction Stop).Source
$package = Get-Content -Raw -Encoding utf8 -LiteralPath 'package.json' | ConvertFrom-Json
$distRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$versionOutput = [IO.Path]::GetFullPath((Join-Path $distRoot $package.version))
$buildOutput = [IO.Path]::GetFullPath((Join-Path $distRoot "portable-build-$PID"))
$unpackedSource = Join-Path $buildOutput 'win-unpacked'
$portableName = "Yuvis-Music-$($package.version)-x64-Portable"
$portableDirectory = [IO.Path]::GetFullPath((Join-Path $versionOutput $portableName))
$portableArchive = [IO.Path]::GetFullPath((Join-Path $versionOutput "$portableName.zip"))

foreach ($target in @($versionOutput, $buildOutput, $portableDirectory, $portableArchive)) {
  if (-not $target.StartsWith("$distRoot$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Portable output escaped dist directory: $target"
  }
}

& $npmExecutable exec -- electron-builder --win dir "--config.directories.output=$buildOutput"
if ($LASTEXITCODE -ne 0) {
  throw "Portable directory build failed with exit code $LASTEXITCODE"
}
$sourceExecutableName = "$($package.build.productName).exe"
$sourceExecutable = $null
$fileReadyDeadline = (Get-Date).AddSeconds(90)
while (-not $sourceExecutable -and (Get-Date) -lt $fileReadyDeadline) {
  $sourceExecutable = Get-ChildItem -LiteralPath $unpackedSource -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq $sourceExecutableName } |
    Select-Object -First 1
  if (-not $sourceExecutable) {
    Start-Sleep -Milliseconds 500
  }
}
if (-not $sourceExecutable) {
  throw "Portable application executable was not created: $unpackedSource"
}

if (Test-Path -LiteralPath $portableDirectory) {
  Remove-Item -LiteralPath $portableDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $versionOutput -Force | Out-Null
New-Item -ItemType Directory -Path $portableDirectory | Out-Null
Copy-Item -Path (Join-Path $unpackedSource '*') -Destination $portableDirectory -Recurse -Force

# The player has no updater and never needs the generic elevation helper. Keeping
# it out of the portable package reduces unnecessary executable attack surface.
$elevationHelper = Join-Path $portableDirectory 'resources\elevate.exe'
if (Test-Path -LiteralPath $elevationHelper -PathType Leaf) {
  Remove-Item -LiteralPath $elevationHelper -Force
}

if (Test-Path -LiteralPath $portableArchive) {
  Remove-Item -LiteralPath $portableArchive -Force
}
Compress-Archive -Path (Join-Path $portableDirectory '*') -DestinationPath $portableArchive -CompressionLevel Optimal

if (-not (Test-Path -LiteralPath $portableArchive -PathType Leaf)) {
  throw "Portable ZIP was not created: $portableArchive"
}

$archiveFile = Get-Item -LiteralPath $portableArchive
Write-Host "Portable ZIP complete: $($archiveFile.FullName) ($($archiveFile.Length) bytes)"

if (Test-Path -LiteralPath $buildOutput) {
  try {
    Remove-Item -LiteralPath $buildOutput -Recurse -Force
  } catch {
    Write-Warning "Unable to clean temporary portable build directory: $buildOutput"
  }
}
