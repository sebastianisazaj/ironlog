# Draws the IronLog dumbbell icon as PNGs (same geometry as public/icon.svg, 64-unit grid).
param([string]$OutDir)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null

function RoundRect($g, $brush, $x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure(); $g.FillPath($brush, $p); $p.Dispose()
}

function Icon($size, $file, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.Clear([System.Drawing.Color]::Transparent)
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $size, $size), ([System.Drawing.Color]::FromArgb(255, 255, 90, 54)), ([System.Drawing.Color]::FromArgb(255, 224, 40, 122))
  if ($maskable) { $g.FillRectangle($grad, 0, 0, $size, $size); $scale = $size / 64 * 0.72; $off = $size * 0.14 }
  else { RoundRect $g $grad 0 0 $size $size ($size * 14 / 64); $scale = $size / 64; $off = 0 }
  $w = [System.Drawing.Brushes]::White
  foreach ($r in @(@(8,22,7,20), @(49,22,7,20), @(15,17,6,30), @(43,17,6,30), @(21,29,22,6))) {
    RoundRect $g $w ($off + $r[0] * $scale) ($off + $r[1] * $scale) ($r[2] * $scale) ($r[3] * $scale) (2 * $scale)
  }
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Icon 192 (Join-Path $OutDir 'icon-192.png') $false
Icon 512 (Join-Path $OutDir 'icon-512.png') $false
Icon 512 (Join-Path $OutDir 'maskable-512.png') $true
Icon 180 (Join-Path $OutDir 'apple-touch-icon.png') $true
Get-ChildItem $OutDir | Select-Object Name, Length
