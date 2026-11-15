$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskIconRoot = Join-Path $PSScriptRoot '..\assets'
$taskIconSizes = @(16, 24, 32, 48, 64, 128, 256)
$taskIconImages = @()
foreach ($taskIconSize in $taskIconSizes) {
    $taskBitmap = New-Object System.Drawing.Bitmap($taskIconSize, $taskIconSize)
    $taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
    $taskGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $taskGraphics.ScaleTransform($taskIconSize / 64.0, $taskIconSize / 64.0)
    $taskBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 88, 204))
    $taskAxisPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 255, 255, 255), 2.5)
    $taskCurvePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 3.5)
    $taskAxisPen.StartCap = $taskAxisPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $taskCurvePen.StartCap = $taskCurvePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $taskGraphics.FillEllipse($taskBrush, 2, 2, 60, 60)
    $taskGraphics.DrawLine($taskAxisPen, 14, 13, 14, 49)
    $taskGraphics.DrawLine($taskAxisPen, 14, 49, 53, 49)
    $taskGraphics.DrawBezier($taskCurvePen, 19, 18, 26, 53, 40, 53, 49, 18)
    $taskPng = New-Object System.IO.MemoryStream
    $taskBitmap.Save($taskPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $taskIconImages += ,$taskPng.ToArray()
    $taskPng.Dispose(); $taskCurvePen.Dispose(); $taskAxisPen.Dispose(); $taskBrush.Dispose()
    $taskGraphics.Dispose(); $taskBitmap.Dispose()
}
$taskIconStream = [System.IO.File]::Create((Join-Path $taskIconRoot 'mathpad.ico'))
$taskIconWriter = New-Object System.IO.BinaryWriter($taskIconStream)
try {
    $taskIconWriter.Write([UInt16]0); $taskIconWriter.Write([UInt16]1); $taskIconWriter.Write([UInt16]$taskIconSizes.Length)
    $taskIconOffset = 6 + 16 * $taskIconSizes.Length
    for ($taskIconIndex = 0; $taskIconIndex -lt $taskIconSizes.Length; $taskIconIndex++) {
        $taskIconDimension = if ($taskIconSizes[$taskIconIndex] -eq 256) { 0 } else { $taskIconSizes[$taskIconIndex] }
        $taskIconWriter.Write([Byte]$taskIconDimension); $taskIconWriter.Write([Byte]$taskIconDimension)
        $taskIconWriter.Write([UInt16]0); $taskIconWriter.Write([UInt16]1); $taskIconWriter.Write([UInt16]32)
        $taskIconWriter.Write([UInt32]$taskIconImages[$taskIconIndex].Length); $taskIconWriter.Write([UInt32]$taskIconOffset)
        $taskIconOffset += $taskIconImages[$taskIconIndex].Length
    }
    foreach ($taskIconImage in $taskIconImages) { $taskIconWriter.Write([Byte[]]$taskIconImage) }
} finally { $taskIconWriter.Dispose(); $taskIconStream.Dispose() }
Write-Output 'Created assets/mathpad.ico (7 sizes).'
