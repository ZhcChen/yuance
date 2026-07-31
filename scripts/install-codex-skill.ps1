[CmdletBinding()]
param(
    [string]$Version,
    [string]$InstallDir,
    [string]$ReleaseDir,
    [switch]$DetectOnly
)

$ErrorActionPreference = "Stop"
$DefaultVersion = "0.1.0"
$Repository = "ZhcChen/yuance"

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = if ($env:YUANCE_AGENT_VERSION) { $env:YUANCE_AGENT_VERSION } else { $DefaultVersion }
}
if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = $env:YUANCE_AGENT_INSTALL_DIR
}
if ([string]::IsNullOrWhiteSpace($ReleaseDir)) {
    $ReleaseDir = $env:YUANCE_AGENT_RELEASE_DIR
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "版本必须是 MAJOR.MINOR.PATCH"
}

$testOs = $env:YUANCE_AGENT_TEST_OS
$os = if ($testOs) { $testOs } else { "Windows" }
$testArch = $env:YUANCE_AGENT_TEST_ARCH
$arch = if ($testArch) {
    $testArch
} else {
    [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
}
if ($os -ne "Windows") {
    throw "不支持的操作系统：$os"
}
$archTarget = switch ($arch.ToUpperInvariant()) {
    "X64" { "x86_64" }
    "AMD64" { "x86_64" }
    "ARM64" { "aarch64" }
    default { throw "不支持的 CPU 架构：$arch" }
}
$target = "$archTarget-pc-windows-msvc"
if ($DetectOnly) {
    Write-Output $target
    exit 0
}

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    if ($env:CODEX_HOME) {
        $InstallDir = Join-Path $env:CODEX_HOME "skills/yuance-agent"
    } else {
        $InstallDir = Join-Path $HOME ".agents/skills/yuance-agent"
    }
}
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)
$existing = Get-Item -LiteralPath $InstallDir -Force -ErrorAction SilentlyContinue
if ($existing -and -not $existing.PSIsContainer) {
    throw "安装路径已存在且不是目录：$InstallDir"
}
if ($existing -and ($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw "安装目录不能是符号链接或重解析点"
}

$asset = "yuance-agent-v$Version-$target.zip"
$tag = "yuance-agent-v$Version"
$downloadBase = "https://github.com/$Repository/releases/download/$tag"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("yuance-agent-install-" + [guid]::NewGuid())
$stagingDir = "$InstallDir.new.$PID"
$backupDir = "$InstallDir.backup.$PID"

try {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    $archive = Join-Path $tempDir $asset
    $checksums = Join-Path $tempDir "SHA256SUMS"
    if ($ReleaseDir) {
        Write-Warning "正在使用本地测试/开发 Release：$ReleaseDir"
        Copy-Item -LiteralPath (Join-Path $ReleaseDir $asset) -Destination $archive
        Copy-Item -LiteralPath (Join-Path $ReleaseDir "SHA256SUMS") -Destination $checksums
    } else {
        Invoke-WebRequest -Uri "$downloadBase/$asset" -OutFile $archive
        Invoke-WebRequest -Uri "$downloadBase/SHA256SUMS" -OutFile $checksums
    }

    $escapedAsset = [regex]::Escape($asset)
    $checksumLine = Get-Content -LiteralPath $checksums | Where-Object {
        $_ -match "^([0-9A-Fa-f]{64})\s+\*?$escapedAsset$"
    } | Select-Object -First 1
    if (-not $checksumLine) {
        throw "SHA256SUMS 中缺少 $asset 的有效校验和"
    }
    $expectedSha = ([regex]::Match($checksumLine, '^[0-9A-Fa-f]{64}')).Value.ToLowerInvariant()
    $actualSha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha -ne $expectedSha) {
        throw "$asset 的 SHA-256 校验失败"
    }

    $extractDir = Join-Path $tempDir "extracted"
    Expand-Archive -LiteralPath $archive -DestinationPath $extractDir
    $packageDir = Join-Path $extractDir "yuance-agent"
    $binary = Join-Path $packageDir "scripts/yuance-agent.exe"
    $required = @(
        (Join-Path $packageDir "SKILL.md"),
        (Join-Path $packageDir "agents/openai.yaml"),
        (Join-Path $packageDir "references/commands.md"),
        (Join-Path $packageDir "references/workflows.md"),
        (Join-Path $packageDir "references/errors.md"),
        $binary
    )
    foreach ($path in $required) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "发布包缺少 $($path.Substring($packageDir.Length + 1))"
        }
    }
    & $binary doctor --installation | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "发布包离线自检失败"
    }

    $installParent = Split-Path -Parent $InstallDir
    New-Item -ItemType Directory -Path $installParent -Force | Out-Null
    if ((Test-Path -LiteralPath $stagingDir) -or (Test-Path -LiteralPath $backupDir)) {
        throw "安装临时路径已存在，请稍后重试"
    }
    Copy-Item -LiteralPath $packageDir -Destination $stagingDir -Recurse

    $hadPrevious = Test-Path -LiteralPath $InstallDir -PathType Container
    if ($hadPrevious) {
        Move-Item -LiteralPath $InstallDir -Destination $backupDir
    }
    try {
        Move-Item -LiteralPath $stagingDir -Destination $InstallDir
    } catch {
        if ($hadPrevious -and (Test-Path -LiteralPath $backupDir)) {
            Move-Item -LiteralPath $backupDir -Destination $InstallDir
        }
        throw "替换安装目录失败，旧版本已恢复：$($_.Exception.Message)"
    }
    if ($hadPrevious -and (Test-Path -LiteralPath $backupDir)) {
        Remove-Item -LiteralPath $backupDir -Recurse -Force
    }

    Write-Output "已安装 yuance-agent v$Version 到 $InstallDir"
    Write-Output "后续请在运行 Codex 的环境中配置 YUANCE_API_TOKEN；需要自定义服务时再配置 YUANCE_BASE_URL。"
} finally {
    if (Test-Path -LiteralPath $tempDir) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force
    }
    if (Test-Path -LiteralPath $stagingDir) {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force
    }
}
