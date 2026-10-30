[CmdletBinding()]
param(
    [string]$TyporaPath,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

function Find-WindowHtml([string]$Directory) {
    if (-not $Directory -or -not (Test-Path -LiteralPath $Directory -PathType Container)) { return }
    foreach ($relative in @('resources\window.html', 'resources\app\window.html', 'window.html')) {
        $candidate = Join-Path $Directory $relative
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
}

$windowPath = $null
if ($TyporaPath) {
    $windowPath = Find-WindowHtml $TyporaPath
} else {
    $registryPaths = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    $locations = @(Get-ItemProperty -Path $registryPaths -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like '*Typora*' } |
        Select-Object -ExpandProperty InstallLocation -ErrorAction SilentlyContinue)
    $locations += @("$env:ProgramFiles\Typora", "${env:ProgramFiles(x86)}\Typora", "$env:LOCALAPPDATA\Programs\Typora")
    foreach ($location in $locations) {
        $windowPath = Find-WindowHtml $location
        if ($windowPath) { break }
    }
}
if (-not $windowPath) {
    throw 'Typora window.html not found. Run with -TyporaPath "D:\path\to\Typora".'
}
if (Get-Process -Name Typora -ErrorAction SilentlyContinue) {
    throw 'Please close Typora completely, then run this script again.'
}

$resourceDir = Split-Path -Parent $windowPath
$pluginDir = Join-Path $resourceDir 'typora-handy'
$legacyDir = Join-Path $resourceDir 'typora-tint'
$pluginPath = Join-Path $pluginDir 'tint.js'
$assetNames = @('image-tools.js', 'tint.js')
$assetPaths = @($assetNames | ForEach-Object { Join-Path $pluginDir $_ })
$legacyAssetPaths = @($assetNames | ForEach-Object { Join-Path $legacyDir $_ })
$backupPath = "$windowPath.typora-handy.bak"
if (-not (Test-Path -LiteralPath $backupPath) -and
    (Test-Path -LiteralPath "$windowPath.typora-tint.bak")) {
    $backupPath = "$windowPath.typora-tint.bak"
}
Write-Host "Typora location: $resourceDir"
$html = [System.IO.File]::ReadAllText($windowPath)
$cleanHtml = $html
foreach ($name in @('typora-handy', 'typora-tint')) {
    $markerPattern = '(?s)<!-- ' + $name + ':start -->.*?<!-- ' + $name + ':end -->'
    $cleanHtml = [regex]::Replace($cleanHtml, $markerPattern, '')
    if ($cleanHtml.Contains("<!-- ${name}:start -->") -or $cleanHtml.Contains("<!-- ${name}:end -->")) {
        throw "Incomplete $name marker in window.html. No changes made."
    }
}
$hasMarker = $cleanHtml -cne $html
$utf8 = New-Object System.Text.UTF8Encoding($false)

# Check existing targets without truncating them, before any backup or update.
foreach ($targetPath in (@($windowPath) + $assetPaths + $legacyAssetPaths)) {
    if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
        try {
            $stream = [System.IO.File]::Open($targetPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
            $stream.Dispose()
        } catch [System.UnauthorizedAccessException] {
            throw "Cannot write '$targetPath'. Run install.cmd and approve administrator access. If already elevated, check whether this file is read-only. No installation changes have been made."
        }
    }
}

function Remove-PluginFiles([string]$Directory) {
    # Delete only known plugin files; preserve any other files in this directory.
    foreach ($assetName in $assetNames) {
        $assetPath = Join-Path $Directory $assetName
        if (Test-Path -LiteralPath $assetPath -PathType Leaf) { Remove-Item -LiteralPath $assetPath }
    }
    if ((Test-Path -LiteralPath $Directory -PathType Container) -and
        @(Get-ChildItem -LiteralPath $Directory -Force).Count -eq 0) {
        Remove-Item -LiteralPath $Directory
    }
}

if ($Uninstall) {
    # Remove only our script tags, keeping later Typora or user changes intact.
    if ($hasMarker) { [System.IO.File]::WriteAllText($windowPath, $cleanHtml, $utf8) }
    Remove-PluginFiles $pluginDir
    Remove-PluginFiles $legacyDir
    Write-Host "typora-handy removed. Backup kept at: $backupPath"
    return
}

foreach ($assetName in $assetNames) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $assetName) -PathType Leaf)) {
        throw "$assetName must be next to install.ps1."
    }
}
if ($cleanHtml -notmatch '(?i)</body\s*>') { throw 'No closing body tag in window.html. No changes made.' }
if (-not (Test-Path -LiteralPath $backupPath)) {
    Copy-Item -LiteralPath $windowPath -Destination $backupPath
}
$null = New-Item -ItemType Directory -Path $pluginDir -Force
foreach ($assetName in $assetNames) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $assetName) -Destination (Join-Path $pluginDir $assetName) -Force
}
$tag = '<!-- typora-handy:start --><script src="./typora-handy/image-tools.js" defer></script><script src="./typora-handy/tint.js" defer></script><!-- typora-handy:end -->'
$updatedHtml = [regex]::Replace($cleanHtml, '(?i)</body\s*>', "$tag</body>")
[System.IO.File]::WriteAllText($windowPath, $updatedHtml, $utf8)
Remove-PluginFiles $legacyDir
Write-Host "typora-handy installed: $pluginPath"
Write-Host 'Start Typora, select text, then right-click. Colors appear above Google search.'
Write-Host 'Click an image to move it freely or resize it with the corner handles.'
