Add-Type -AssemblyName System.Drawing

$ProjectDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$IconPath = Join-Path $ProjectDir "static\ootp27_hub.ico"

# Generate a custom high-contrast Baseball Diamond + Statcast Icon (.ico)
$bmp = New-Object System.Drawing.Bitmap(64, 64)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 11, 19, 36))
$g.FillEllipse($bgBrush, 2, 2, 60, 60)

$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), 3)
$g.DrawEllipse($borderPen, 2, 2, 60, 60)

$diamondPts = @(
    (New-Object System.Drawing.Point(32, 12)),
    (New-Object System.Drawing.Point(52, 32)),
    (New-Object System.Drawing.Point(32, 52)),
    (New-Object System.Drawing.Point(12, 32))
)
$turfBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
$g.FillPolygon($turfBrush, $diamondPts)

$linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 2.5)
$g.DrawPolygon($linePen, $diamondPts)
$g.Dispose()

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream($IconPath, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$bmp.Dispose()

$DesktopDir = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopDir "OOTP 27 Analytics & Hosting Hub.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = """$ProjectDir\Launch_OOTP27_Hub.vbs"""
$Shortcut.WorkingDirectory = $ProjectDir
$Shortcut.IconLocation = "$IconPath,0"
$Shortcut.Description = "Launch OOTP 27 Local Analytics, Statcast Spray Charts, StatsPlus & BNN HTML Suite on localhost:8080"
$Shortcut.Save()

Write-Output "Created Desktop Shortcut: $ShortcutPath"
