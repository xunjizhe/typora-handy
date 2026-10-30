[CmdletBinding()]
param([string]$BrowserPath, [string]$Screenshot)
$ErrorActionPreference = 'Stop'
if (-not $BrowserPath) {
    foreach ($candidate in @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe")) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $BrowserPath = $candidate; break }
    }
}
if (-not $BrowserPath) { throw 'Chrome or Edge is required. Pass -BrowserPath to specify its executable.' }
$profileDir = Join-Path $PSScriptRoot ('.browser-fixture-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $profileDir
$page = ([uri](Join-Path $PSScriptRoot 'images.browser.html')).AbsoluteUri
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = $BrowserPath
$info.Arguments = '--headless --disable-gpu --no-first-run --no-default-browser-check --allow-file-access-from-files --virtual-time-budget=5000 --dump-dom --user-data-dir="' + $profileDir + '" '
if ($Screenshot) { $info.Arguments += '--screenshot="' + [System.IO.Path]::GetFullPath($Screenshot) + '" --window-size=1100,850 ' }
$info.Arguments += '"' + $page + '"'
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$process = New-Object System.Diagnostics.Process
$process.StartInfo = $info
try {
    $null = $process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(30000)) {
        $process.Kill()
        throw 'Browser tests timed out.'
    }
    $html = $stdout.Result
    $result = [regex]::Match($html, '<pre id="results"[^>]*>(.*?)</pre>', 'Singleline')
    $message = [System.Net.WebUtility]::HtmlDecode($result.Groups[1].Value)
    if ($process.ExitCode -ne 0 -or -not $message.StartsWith('PASS:')) {
        throw ("Browser image regression failed: " + $message + "`n" + $stderr.Result)
    }
    Write-Host $message
} finally {
    $process.Dispose()
    $resolvedProfile = (Resolve-Path -LiteralPath $profileDir).Path
    $resolvedTests = (Resolve-Path -LiteralPath $PSScriptRoot).Path
    if ((Split-Path -Parent $resolvedProfile) -eq $resolvedTests -and
        (Split-Path -Leaf $resolvedProfile) -like '.browser-fixture-*') {
        Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction SilentlyContinue
    }
}
