$ErrorActionPreference = 'Stop'
$installer = Join-Path (Split-Path -Parent $PSScriptRoot) 'install.ps1'
$fixtureRoot = Join-Path $PSScriptRoot ('.fixture-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixtureRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)

# Never stop or modify the real Typora process; the installer only sees fixtures.
function Get-Process { param($Name, $ErrorAction) return @() }
function Assert-True($Condition, $Message) { if (-not $Condition) { throw $Message } }

try {
    foreach ($layout in @('resources', 'resources\app')) {
        $root = Join-Path $fixtureRoot ($layout -replace '\\', '-')
        $resources = Join-Path $root $layout
        $null = New-Item -ItemType Directory -Path $resources -Force
        $windowPath = Join-Path $resources 'window.html'
        $original = '<!doctype html><html><body><p>original</p><script src="app.js"></script></body></html>'
        [System.IO.File]::WriteAllText($windowPath, $original, $utf8)

        & $installer -TyporaPath $root
        $installed = [System.IO.File]::ReadAllText($windowPath)
        Assert-True ($installed.Contains('src="./typora-handy/tint.js"')) 'Missing script tag'
        Assert-True (Test-Path -LiteralPath (Join-Path $resources 'typora-handy\tint.js')) 'Missing plugin'
        Assert-True (Test-Path -LiteralPath (Join-Path $resources 'typora-handy\image-tools.js')) 'Missing image tools'
        Assert-True ($installed.IndexOf('typora-handy/image-tools.js') -lt $installed.IndexOf('typora-handy/tint.js')) 'Image tools must load before the entry script'
        foreach ($asset in @('tint.js', 'image-tools.js')) {
            $sourceHash = (Get-FileHash -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) $asset)).Hash
            $installedHash = (Get-FileHash -LiteralPath (Join-Path $resources "typora-handy\$asset")).Hash
            Assert-True ($sourceHash -ceq $installedHash) "Wrong installed asset: $asset"
        }
        Assert-True ([System.IO.File]::ReadAllText("$windowPath.typora-handy.bak") -ceq $original) 'Backup differs from original'

        & $installer -TyporaPath $root
        Assert-True ([System.IO.File]::ReadAllText($windowPath) -ceq $installed) 'Repeat install changed HTML'
        Assert-True ([System.IO.File]::ReadAllText("$windowPath.typora-handy.bak") -ceq $original) 'Repeat install overwrote backup'

        $legacyTag = '<!-- typora-tint:start --><script src="./typora-tint/tint.js" defer></script><!-- typora-tint:end -->'
        [System.IO.File]::WriteAllText($windowPath, $original.Replace('</body>', "$legacyTag</body>"), $utf8)
        & $installer -TyporaPath $root
        Assert-True ([System.IO.File]::ReadAllText($windowPath) -ceq $installed) 'Upgrade from the old color-only loader failed'

        # A protected plugin must fail before window.html or the backup is changed.
        $installedPlugin = Join-Path $resources 'typora-handy\tint.js'
        $attributes = [System.IO.File]::GetAttributes($installedPlugin)
        [System.IO.File]::SetAttributes($installedPlugin, $attributes -bor [System.IO.FileAttributes]::ReadOnly)
        try {
            $writeRejected = $false
            try { & $installer -TyporaPath $root } catch { $writeRejected = $true }
            Assert-True $writeRejected 'A read-only plugin was accepted'
            Assert-True ([System.IO.File]::ReadAllText($windowPath) -ceq $installed) 'A rejected update modified HTML'
            Assert-True ([System.IO.File]::ReadAllText("$windowPath.typora-handy.bak") -ceq $original) 'A rejected update modified the backup'
        } finally {
            [System.IO.File]::SetAttributes($installedPlugin, $attributes)
        }

        # Another customization added later must survive uninstall.
        $changed = $installed.Replace('<p>original</p>', '<p>customized</p>')
        [System.IO.File]::WriteAllText($windowPath, $changed, $utf8)
        & $installer -TyporaPath $root -Uninstall
        Assert-True ([System.IO.File]::ReadAllText($windowPath) -ceq $original.Replace('<p>original</p>', '<p>customized</p>')) 'Uninstall lost other edits'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $resources 'typora-handy'))) 'Plugin not removed'
        & $installer -TyporaPath $root -Uninstall

        $package = Join-Path $fixtureRoot ((Split-Path -Leaf $root) + '-missing-image-package')
        $null = New-Item -ItemType Directory -Path $package
        Copy-Item -LiteralPath $installer -Destination (Join-Path $package 'install.ps1')
        Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'tint.js') -Destination (Join-Path $package 'tint.js')
        $beforeMissing = [System.IO.File]::ReadAllText($windowPath)
        $missingRejected = $false
        try { & (Join-Path $package 'install.ps1') -TyporaPath $root } catch { $missingRejected = $_.Exception.Message -like 'image-tools.js must be next*' }
        Assert-True $missingRejected 'Missing image module was not reported'
        Assert-True ([System.IO.File]::ReadAllText($windowPath) -ceq $beforeMissing) 'An incomplete package changed the application'
        Assert-True (-not (Test-Path -LiteralPath (Join-Path $resources 'typora-handy'))) 'An incomplete package partially installed the plugin'

        # Reject an invalid HTML file before making a backup or copying files.
        [System.IO.File]::WriteAllText($windowPath, '<html>invalid</html>', $utf8)
        $rejected = $false
        try { & $installer -TyporaPath $root } catch { $rejected = $true }
        Assert-True $rejected 'Invalid HTML was accepted'
        Assert-True ([System.IO.File]::ReadAllText($windowPath) -ceq '<html>invalid</html>') 'Invalid HTML was modified'
    }
    # Rename upgrades must keep the original backup and unrelated directory files.
    foreach ($mode in @('color-only', 'images', 'mixed', 'uninstall')) {
        $root = Join-Path $fixtureRoot "legacy-$mode"
        $resources = Join-Path $root 'resources'
        $legacyDir = Join-Path $resources 'typora-tint'
        $handyDir = Join-Path $resources 'typora-handy'
        $null = New-Item -ItemType Directory -Path $legacyDir -Force
        $windowPath = Join-Path $resources 'window.html'
        $original = '<html><body><p>before installation</p></body></html>'
        $legacyScripts = '<script src="./typora-tint/tint.js" defer></script>'
        [System.IO.File]::WriteAllText((Join-Path $legacyDir 'tint.js'), 'old colors', $utf8)
        if ($mode -ne 'color-only') {
            $legacyScripts = '<script src="./typora-tint/image-tools.js" defer></script>' + $legacyScripts
            [System.IO.File]::WriteAllText((Join-Path $legacyDir 'image-tools.js'), 'old images', $utf8)
        }
        [System.IO.File]::WriteAllText((Join-Path $legacyDir 'keep.txt'), 'user file', $utf8)
        [System.IO.File]::WriteAllText("$windowPath.typora-tint.bak", $original, $utf8)
        $tags = '<!-- typora-tint:start -->' + $legacyScripts + '<!-- typora-tint:end -->'
        if ($mode -eq 'mixed') {
            $tags += '<!-- typora-handy:start --><script src="./typora-handy/tint.js" defer></script><!-- typora-handy:end -->'
        }
        $customized = $original.Replace('before installation', 'user edit')
        [System.IO.File]::WriteAllText($windowPath, $customized.Replace('</body>', "$tags</body>"), $utf8)

        & $installer -TyporaPath $root -Uninstall:($mode -eq 'uninstall')
        $result = [System.IO.File]::ReadAllText($windowPath)
        Assert-True (-not $result.Contains('typora-tint')) 'The old loader was left behind'
        Assert-True ($result.Contains('<p>user edit</p>')) 'Rename lost other HTML edits'
        Assert-True ([System.IO.File]::ReadAllText("$windowPath.typora-tint.bak") -ceq $original) 'Rename overwrote the original backup'
        Assert-True (-not (Test-Path -LiteralPath "$windowPath.typora-handy.bak")) 'Rename created a backup of already modified HTML'
        Assert-True ([System.IO.File]::ReadAllText((Join-Path $legacyDir 'keep.txt')) -ceq 'user file') 'Rename deleted unrelated files'
        foreach ($asset in @('tint.js', 'image-tools.js')) {
            Assert-True (-not (Test-Path -LiteralPath (Join-Path $legacyDir $asset))) 'An old plugin file was left behind'
        }
        if ($mode -eq 'uninstall') {
            Assert-True ($result -ceq $customized) 'Direct uninstall of the old version failed'
            Assert-True (-not (Test-Path -LiteralPath $handyDir)) 'Uninstall created the new plugin folder'
        } else {
            Assert-True (([regex]::Matches($result, '<!-- typora-handy:start -->')).Count -eq 1) 'Rename added duplicate loaders'
            foreach ($asset in @('tint.js', 'image-tools.js')) {
                Assert-True (Test-Path -LiteralPath (Join-Path $handyDir $asset)) 'Rename did not install the new assets'
            }
            & $installer -TyporaPath $root
            Assert-True ([System.IO.File]::ReadAllText($windowPath) -ceq $result) 'Repeat install after rename changed HTML'
            & $installer -TyporaPath $root -Uninstall
            Assert-True ([System.IO.File]::ReadAllText($windowPath) -ceq $customized) 'Uninstall after rename lost edits'
        }
    }
    Write-Host 'PASS: install, backup, repeat install, uninstall, preserve edits, legacy layout, invalid HTML, rename upgrades.'
} finally {
    # Verify the resolved deletion target is our uniquely named fixture directory.
    $resolvedFixture = (Resolve-Path -LiteralPath $fixtureRoot).Path
    $resolvedTests = (Resolve-Path -LiteralPath $PSScriptRoot).Path
    if ((Split-Path -Parent $resolvedFixture) -eq $resolvedTests -and
        (Split-Path -Leaf $resolvedFixture) -like '.fixture-*') {
        Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
    }
}
