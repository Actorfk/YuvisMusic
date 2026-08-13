Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildDirectory = Join-Path $projectRoot 'build'
$iconPath = Join-Path $buildDirectory 'icon.ico'

if (-not (Test-Path $buildDirectory)) {
  New-Item -ItemType Directory -Path $buildDirectory | Out-Null
}

function New-RoundedPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$bitmap = New-Object System.Drawing.Bitmap 256, 256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$background = New-RoundedPath -X 14 -Y 14 -Width 228 -Height 228 -Radius 54
$backgroundBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 24, 24, 27))
$graphics.FillPath($backgroundBrush, $background)

$whiteBar = New-RoundedPath -X 78 -Y 66 -Width 25 -Height 124 -Radius 12.5
$redBar = New-RoundedPath -X 145 -Y 92 -Width 25 -Height 98 -Radius 12.5
$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$redBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 207, 10, 44))
$graphics.FillPath($whiteBrush, $whiteBar)
$graphics.FillPath($redBrush, $redBar)

$accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 207, 10, 44))
$graphics.FillEllipse($accentBrush, 76, 44, 29, 29)

$handle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()

$icon.Dispose()
$accentBrush.Dispose()
$redBrush.Dispose()
$whiteBrush.Dispose()
$backgroundBrush.Dispose()
$whiteBar.Dispose()
$redBar.Dispose()
$background.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Generated $iconPath"
