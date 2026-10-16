# Rasterize the existing favicon's N mark at PWA sizes, without a new visual identity.
# Run from the repository root with PowerShell on Windows.
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path (Get-Location) 'public/icons'
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null
foreach ($iconSize in @(180, 192, 512)) {
    $bitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#191F51'))
    $factor = $iconSize / 64.0
    $points = @(@(17,46), @(17,18), @(24,18), @(40,37), @(40,18), @(47,18), @(47,46), @(40,46), @(24,27), @(24,46))
    $polygon = [System.Drawing.PointF[]] @($points | ForEach-Object { [System.Drawing.PointF]::new($_[0] * $factor, $_[1] * $factor) })
    $graphics.FillPolygon([System.Drawing.Brushes]::White, $polygon)
    $filename = if ($iconSize -eq 180) { 'apple-touch-icon.png' } else { "icon-$iconSize.png" }
    $bitmap.Save((Join-Path $iconDirectory $filename), [System.Drawing.Imaging.ImageFormat]::Png)
    if ($iconSize -eq 512) { $bitmap.Save((Join-Path $iconDirectory 'icon-maskable-512.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
    $graphics.Dispose()
    $bitmap.Dispose()
}
