$ErrorActionPreference = "Stop"

$appName = "JIMDUR ERP"
$appUrl = if ($env:JIMDUR_APP_URL) { $env:JIMDUR_APP_URL } else { "https://TU-PROYECTO.vercel.app/" }
$appUrl = $appUrl.TrimEnd("/") + "/"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconPath = Join-Path $scriptDir "JIMDUR.ico"

try {
    $browserCandidates = New-Object System.Collections.Generic.List[string]
    $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)
    foreach ($root in $roots) {
        if (-not $root) { continue }
        $browserCandidates.Add((Join-Path $root "Microsoft\Edge\Application\msedge.exe"))
    }
    foreach ($root in $roots) {
        if (-not $root) { continue }
        $browserCandidates.Add((Join-Path $root "Google\Chrome\Application\chrome.exe"))
    }

    $browserPath = $browserCandidates |
        Where-Object { Test-Path $_ } |
        Select-Object -First 1

    if (-not $browserPath) {
        throw "No se encontro Microsoft Edge ni Google Chrome en este equipo."
    }

    $desktop = [Environment]::GetFolderPath("Desktop")
    $programs = Join-Path ([Environment]::GetFolderPath("StartMenu")) "Programs"
    $shell = New-Object -ComObject WScript.Shell

    function New-JimdurShortcut {
        param([string]$ShortcutPath)

        $shortcut = $shell.CreateShortcut($ShortcutPath)
        $shortcut.TargetPath = $browserPath
        $shortcut.Arguments = '--app="' + $appUrl + '" --start-maximized'
        $shortcut.WorkingDirectory = Split-Path -Parent $browserPath
        $shortcut.Description = "Inventario y operaciones de Grupo JIMDUR"
        if (Test-Path $iconPath) {
            $shortcut.IconLocation = $iconPath + ",0"
        }
        $shortcut.Save()
    }

    $desktopShortcut = Join-Path $desktop ($appName + ".lnk")
    $startShortcut = Join-Path $programs ($appName + ".lnk")
    New-JimdurShortcut -ShortcutPath $desktopShortcut
    New-JimdurShortcut -ShortcutPath $startShortcut

    Write-Host "Acceso creado en el Escritorio." -ForegroundColor Green
    Write-Host "Acceso creado en el menu Inicio." -ForegroundColor Green
    Write-Host "Abriendo JIMDUR ERP..." -ForegroundColor Cyan
    Start-Process $desktopShortcut
    exit 0
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
