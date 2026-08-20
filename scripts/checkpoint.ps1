param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateNotNullOrEmpty()]
  [string]$Message
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
  }
}

$gitExecutable = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $gitExecutable) {
  $gitCandidates = @(
    'C:\Program Files\Git\cmd\git.exe',
    'C:\Program Files\Git\bin\git.exe',
    "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
  )
  $gitExecutable = $gitCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $gitExecutable) {
  throw 'Git was not found. Install Git for Windows before creating a checkpoint.'
}

$npmExecutable = (Get-Command npm.cmd -ErrorAction Stop).Source
$package = Get-Content -Raw -Encoding utf8 -LiteralPath 'package.json' | ConvertFrom-Json
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$safeMessage = ($Message -replace '[\\/:*?"<>|]', '-' -replace '\s+', '-').Trim('-')
if (-not $safeMessage) { $safeMessage = 'checkpoint' }
if ($safeMessage.Length -gt 48) { $safeMessage = $safeMessage.Substring(0, 48).TrimEnd('-') }

Write-Host '[1/6] Regenerating application icons...'
Invoke-Checked -FilePath $npmExecutable -Arguments @('run', 'icon')

Write-Host '[2/6] Checking source...'
Invoke-Checked -FilePath $npmExecutable -Arguments @('run', 'check')

Write-Host '[3/6] Building installer...'
Invoke-Checked -FilePath $npmExecutable -Arguments @('run', 'build')

Write-Host '[4/6] Building portable ZIP...'
Invoke-Checked -FilePath $npmExecutable -Arguments @('run', 'build:portable')

$versionOutput = Join-Path $projectRoot "dist\$($package.version)"
$installerPath = Join-Path $versionOutput "Yuvis-Music-$($package.version)-x64.exe"
$portableName = "Yuvis-Music-$($package.version)-x64-Portable"
$portableDirectory = Join-Path $versionOutput $portableName
$applicationExecutableName = "$($package.build.productName).exe"
$portableExecutable = Join-Path $portableDirectory $applicationExecutableName
$portableArchive = Join-Path $versionOutput "$portableName.zip"
foreach ($artifactPath in @($installerPath, $portableExecutable, $portableArchive)) {
  if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
    throw "Expected artifact was not created: $artifactPath"
  }
}

Write-Host '[5/6] Committing source and creating checkpoint tag...'
if (-not (Test-Path -LiteralPath '.git')) {
  Invoke-Checked -FilePath $gitExecutable -Arguments @('init')
}

$configuredName = & $gitExecutable config --local user.name
if (-not $configuredName) {
  Invoke-Checked -FilePath $gitExecutable -Arguments @('config', '--local', 'user.name', 'Yuvis Checkpoint')
}
$configuredEmail = & $gitExecutable config --local user.email
if (-not $configuredEmail) {
  Invoke-Checked -FilePath $gitExecutable -Arguments @('config', '--local', 'user.email', 'checkpoint@yuvis.local')
}

Invoke-Checked -FilePath $gitExecutable -Arguments @('add', '--all')
& $gitExecutable diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  Invoke-Checked -FilePath $gitExecutable -Arguments @('commit', '-m', "checkpoint: $Message")
}

$commit = (& $gitExecutable rev-parse 'HEAD').Trim()
$tag = "checkpoint-$timestamp"
$tagExists = & $gitExecutable tag --list $tag
if ($tagExists) {
  $tag = "$tag-$([guid]::NewGuid().ToString('N').Substring(0, 6))"
}
Invoke-Checked -FilePath $gitExecutable -Arguments @('tag', '-a', $tag, '-m', $Message)

Write-Host '[6/6] Archiving executable files...'
$archiveRoot = Join-Path $projectRoot 'releases'
$archiveDirectory = Join-Path $archiveRoot "$timestamp-$safeMessage"
New-Item -ItemType Directory -Path $archiveDirectory -Force | Out-Null

$archivedInstaller = Join-Path $archiveDirectory (Split-Path -Leaf $installerPath)
$archivedPortableDirectory = Join-Path $archiveDirectory $portableName
$archivedPortableExecutable = Join-Path $archivedPortableDirectory $applicationExecutableName
$archivedPortableArchive = Join-Path $archiveDirectory (Split-Path -Leaf $portableArchive)
Copy-Item -LiteralPath $installerPath -Destination $archivedInstaller
Copy-Item -LiteralPath $portableDirectory -Destination $archivedPortableDirectory -Recurse
Copy-Item -LiteralPath $portableArchive -Destination $archivedPortableArchive

$artifacts = @($archivedInstaller, $archivedPortableExecutable, $archivedPortableArchive) | ForEach-Object {
  $file = Get-Item -LiteralPath $_
  [ordered]@{
    name = $file.FullName.Substring($archiveDirectory.Length + 1)
    sizeBytes = $file.Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash
  }
}

$manifest = [ordered]@{
  createdAt = (Get-Date).ToString('o')
  message = $Message
  version = $package.version
  gitCommit = $commit
  gitTag = $tag
  artifacts = $artifacts
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $archiveDirectory 'checkpoint.json')
@(
  "Latest archive: $archiveDirectory"
  "Git tag: $tag"
  "Git commit: $commit"
) | Set-Content -Encoding utf8 -LiteralPath (Join-Path $archiveRoot 'LATEST.txt')

Write-Host 'Checkpoint complete'
Write-Host "Tag: $tag"
Write-Host "Commit: $commit"
Write-Host "Archive: $archiveDirectory"
