[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$Installer = Join-Path $PSScriptRoot "install-codex-skill.ps1"
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("yuance-agent-installer-test-" + [guid]::NewGuid())
$ReleaseDir = Join-Path $TempDir "release fixture"
$InstallDir = Join-Path $TempDir "install root/yuance-agent"
$TokenSentinel = "yuance_pat_must_not_be_printed"
$LegacyCodexHome = Join-Path $TempDir "legacy codex"
$OriginalApiToken = $env:YUANCE_API_TOKEN
$OriginalCodexHome = $env:CODEX_HOME

function Assert-Equal([string]$Actual, [string]$Expected) {
    if ($Actual -ne $Expected) {
        throw "期望 '$Expected'，实际 '$Actual'"
    }
}

function New-TestRelease([string]$Version, [string]$Marker, [string]$Mode = "ok") {
    $target = (& $Installer -DetectOnly).Trim()
    $asset = "yuance-agent-v$Version-$target.zip"
    $build = Join-Path $TempDir "build-$Version-$Marker-$Mode"
    $package = Join-Path $build "yuance-agent"
    Remove-Item -LiteralPath $build, $ReleaseDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path (Join-Path $package "agents"), (Join-Path $package "references"), (Join-Path $package "scripts"), $ReleaseDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $RootDir "skills/yuance-agent/SKILL.md") -Destination (Join-Path $package "SKILL.md")
    Copy-Item -LiteralPath (Join-Path $RootDir "skills/yuance-agent/agents/openai.yaml") -Destination (Join-Path $package "agents/openai.yaml")
    Copy-Item -Path (Join-Path $RootDir "skills/yuance-agent/references/*.md") -Destination (Join-Path $package "references")
    Set-Content -LiteralPath (Join-Path $package "fixture-marker.txt") -Value $Marker -NoNewline
    if ($Mode -ne "missing-binary") {
        $binary = Join-Path $package "scripts/yuance-agent.exe"
        if ($Mode -eq "self-check-fails") {
            Set-Content -LiteralPath $binary -Value "invalid executable" -Encoding ascii
        } else {
            Copy-Item -LiteralPath (Join-Path $RootDir "target/debug/yuance-agent.exe") -Destination $binary
        }
    }
    Compress-Archive -Path $package -DestinationPath (Join-Path $ReleaseDir $asset)
    $sha = (Get-FileHash -LiteralPath (Join-Path $ReleaseDir $asset) -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath (Join-Path $ReleaseDir "SHA256SUMS") -Value "$sha  $asset" -Encoding ascii
}

try {
    New-Item -ItemType Directory -Path $TempDir | Out-Null
    & cargo build -p yuance-agent
    if ($LASTEXITCODE -ne 0) { throw "无法构建 Windows 测试 CLI" }
    foreach ($mapping in @(
        @("AMD64", "x86_64-pc-windows-msvc"),
        @("ARM64", "aarch64-pc-windows-msvc")
    )) {
        $env:YUANCE_AGENT_TEST_ARCH = $mapping[0]
        $detected = (& $Installer -DetectOnly).Trim()
        Assert-Equal $detected $mapping[1]
    }
    Remove-Item Env:YUANCE_AGENT_TEST_ARCH -ErrorAction SilentlyContinue

    New-TestRelease "0.1.1" "initial"
    $env:YUANCE_API_TOKEN = $TokenSentinel
    $env:CODEX_HOME = $LegacyCodexHome
    New-Item -ItemType Directory -Path $LegacyCodexHome | Out-Null
    "[mcp_servers.yuance]`ncommand = `"node`"`n`n[mcp_servers.other]`ncommand = `"other`"" | Set-Content -LiteralPath (Join-Path $LegacyCodexHome "config.toml")
    $output = (& $Installer -ReleaseDir $ReleaseDir -InstallDir $InstallDir 3>&1 | Out-String)
    if (-not (Test-Path -LiteralPath (Join-Path $InstallDir "SKILL.md") -PathType Leaf)) { throw "首次安装缺少 SKILL.md" }
    Assert-Equal (Get-Content -LiteralPath (Join-Path $InstallDir "fixture-marker.txt") -Raw) "initial"
    if ($output.Contains($TokenSentinel)) { throw "安装输出泄露 Token" }
    if (-not $output.Contains("YUANCE_API_TOKEN")) { throw "安装输出缺少后续配置说明" }
    if (-not $output.Contains("检测到旧版元策接入")) { throw "安装输出缺少旧版迁移提示" }
    if (-not (Select-String -LiteralPath (Join-Path $LegacyCodexHome "config.toml") -Pattern '^\[mcp_servers\.other\]' -Quiet)) { throw "安装器修改了其他旧配置" }

    New-TestRelease "0.1.2" "upgraded"
    & $Installer -Version "0.1.2" -ReleaseDir $ReleaseDir -InstallDir $InstallDir | Out-Null
    Assert-Equal (Get-Content -LiteralPath (Join-Path $InstallDir "fixture-marker.txt") -Raw) "upgraded"

    New-TestRelease "0.1.2" "checksum-failure"
    $currentTarget = (& $Installer -DetectOnly).Trim()
    Add-Content -LiteralPath (Join-Path $ReleaseDir "yuance-agent-v0.1.2-$currentTarget.zip") -Value "tampered"
    try {
        & $Installer -Version "0.1.2" -ReleaseDir $ReleaseDir -InstallDir $InstallDir | Out-Null
        throw "校验和错误时安装器意外成功"
    } catch {
        if ($_.Exception.Message -eq "校验和错误时安装器意外成功") { throw }
    }
    Assert-Equal (Get-Content -LiteralPath (Join-Path $InstallDir "fixture-marker.txt") -Raw) "upgraded"

    New-TestRelease "0.1.2" "missing" "missing-binary"
    try {
        & $Installer -Version "0.1.2" -ReleaseDir $ReleaseDir -InstallDir $InstallDir | Out-Null
        throw "发布包缺文件时安装器意外成功"
    } catch {
        if ($_.Exception.Message -eq "发布包缺文件时安装器意外成功") { throw }
    }
    Assert-Equal (Get-Content -LiteralPath (Join-Path $InstallDir "fixture-marker.txt") -Raw) "upgraded"

    New-TestRelease "0.1.2" "self-check" "self-check-fails"
    try {
        & $Installer -Version "0.1.2" -ReleaseDir $ReleaseDir -InstallDir $InstallDir | Out-Null
        throw "离线自检失败时安装器意外成功"
    } catch {
        if ($_.Exception.Message -eq "离线自检失败时安装器意外成功") { throw }
    }
    Assert-Equal (Get-Content -LiteralPath (Join-Path $InstallDir "fixture-marker.txt") -Raw) "upgraded"

    Write-Output "PowerShell 安装器测试通过。"
} finally {
    Remove-Item Env:YUANCE_AGENT_TEST_ARCH -ErrorAction SilentlyContinue
    if ($null -eq $OriginalApiToken) { Remove-Item Env:YUANCE_API_TOKEN -ErrorAction SilentlyContinue } else { $env:YUANCE_API_TOKEN = $OriginalApiToken }
    if ($null -eq $OriginalCodexHome) { Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue } else { $env:CODEX_HOME = $OriginalCodexHome }
    Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
