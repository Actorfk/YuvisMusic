Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildDirectory = Join-Path $projectRoot 'build'
$iconPath = Join-Path $buildDirectory 'icon.ico'
$inAppIconPath = Join-Path $projectRoot 'src\app-icon.png'

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
$backgroundBounds = [System.Drawing.RectangleF]::new(14, 14, 228, 228)
$backgroundStart = [System.Drawing.Color]::FromArgb(255, 250, 253, 255)
$backgroundEnd = [System.Drawing.Color]::FromArgb(255, 105, 174, 246)
$backgroundBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($backgroundBounds, $backgroundStart, $backgroundEnd, 132.0)
$graphics.FillPath($backgroundBrush, $background)

$graphics.SetClip($background)
$glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(115, 255, 255, 255))
$graphics.FillEllipse($glowBrush, -24, -42, 230, 205)
$depthBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(42, 32, 93, 184))
$graphics.FillEllipse($depthBrush, 108, 128, 210, 185)
$graphics.ResetClip()
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 255, 255, 255)), 2
$graphics.DrawPath($borderPen, $background)

$whiteBar = New-RoundedPath -X 78 -Y 66 -Width 25 -Height 124 -Radius 12.5
$blueBar = New-RoundedPath -X 145 -Y 92 -Width 25 -Height 98 -Radius 12.5
$whiteBarShadow = New-RoundedPath -X 81 -Y 70 -Width 25 -Height 124 -Radius 12.5
$blueBarShadow = New-RoundedPath -X 148 -Y 96 -Width 25 -Height 98 -Radius 12.5
$shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(46, 18, 57, 118))
$graphics.FillPath($shadowBrush, $whiteBarShadow)
$graphics.FillPath($shadowBrush, $blueBarShadow)
$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$blueBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 102, 211))
$graphics.FillPath($whiteBrush, $whiteBar)
$graphics.FillPath($blueBrush, $blueBar)

$accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 102, 211))
$graphics.FillEllipse($accentBrush, 76, 44, 29, 29)
$sparkleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 255, 255, 255))
$graphics.FillEllipse($sparkleBrush, 204, 49, 10, 10)
$graphics.FillEllipse($sparkleBrush, 218, 66, 5, 5)

$bitmap.Save($inAppIconPath, [System.Drawing.Imaging.ImageFormat]::Png)

$iconWidth = 256
$iconHeight = 256
$xorSize = $iconWidth * $iconHeight * 4
$maskStride = [int]([Math]::Ceiling($iconWidth / 32) * 4)
$maskSize = $maskStride * $iconHeight
$imageSize = 40 + $xorSize + $maskSize
$iconStream = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create)
$writer = New-Object System.IO.BinaryWriter($iconStream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]1)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([byte]0)
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]$imageSize)
$writer.Write([uint32]22)
$writer.Write([uint32]40)
$writer.Write([int32]$iconWidth)
$writer.Write([int32]($iconHeight * 2))
$writer.Write([uint16]1)
$writer.Write([uint16]32)
$writer.Write([uint32]0)
$writer.Write([uint32]$xorSize)
$writer.Write([int32]0)
$writer.Write([int32]0)
$writer.Write([uint32]0)
$writer.Write([uint32]0)
for ($y = $iconHeight - 1; $y -ge 0; $y--) {
  for ($x = 0; $x -lt $iconWidth; $x++) {
    $pixel = $bitmap.GetPixel($x, $y)
    $writer.Write([byte]$pixel.B)
    $writer.Write([byte]$pixel.G)
    $writer.Write([byte]$pixel.R)
    $writer.Write([byte]$pixel.A)
  }
}
for ($y = $iconHeight - 1; $y -ge 0; $y--) {
  $maskRow = New-Object byte[] $maskStride
  for ($x = 0; $x -lt $iconWidth; $x++) {
    if ($bitmap.GetPixel($x, $y).A -lt 128) {
      $byteIndex = [int][Math]::Floor($x / 8)
      $maskRow[$byteIndex] = $maskRow[$byteIndex] -bor (0x80 -shr ($x % 8))
    }
  }
  $writer.Write($maskRow)
}
$writer.Dispose()
$iconStream.Dispose()

$sparkleBrush.Dispose()
$accentBrush.Dispose()
$blueBrush.Dispose()
$whiteBrush.Dispose()
$shadowBrush.Dispose()
$blueBarShadow.Dispose()
$whiteBarShadow.Dispose()
$borderPen.Dispose()
$depthBrush.Dispose()
$glowBrush.Dispose()
$backgroundBrush.Dispose()
$whiteBar.Dispose()
$blueBar.Dispose()
$background.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Generated $iconPath and $inAppIconPath"
