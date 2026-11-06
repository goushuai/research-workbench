param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$source = Split-Path $PSScriptRoot -Parent
$deployment = if ($env:WORKBENCH_DEPLOY_DIR) { [IO.Path]::GetFullPath($env:WORKBENCH_DEPLOY_DIR) } else { $source + '-deploy' }
if (-not $env:HTTPS_PROXY) {
    $networkProxy = $env:WORKBENCH_NETWORK_PROXY
    if (-not $networkProxy) {
        $target = [Uri]'https://github.com'
        $systemProxy = [Net.WebRequest]::GetSystemWebProxy().GetProxy($target)
        if ($systemProxy.AbsoluteUri -ne $target.AbsoluteUri) { $networkProxy = $systemProxy.AbsoluteUri }
    }
    if ($networkProxy) { $env:HTTPS_PROXY = $networkProxy }
}
if (-not $env:HTTP_PROXY -and $env:HTTPS_PROXY) { $env:HTTP_PROXY = $env:HTTPS_PROXY }
$node = Get-Command node -ErrorAction SilentlyContinue
$usable = $false
if ($node) {
    $nodePath = $node.Source
    $major = & $nodePath -p 'process.versions.node.match(/^[0-9]+/)[0]'
    $usable = $LASTEXITCODE -eq 0 -and [int]$major -ge 24
}
if (-not $usable) {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    $version = '24.13.0'
    $name = "node-v$version-win-$arch"
    $download = Join-Path $deployment 'tmp'
    $tools = Join-Path $deployment 'tools/node'
    New-Item -ItemType Directory -Force -Path $download, $tools | Out-Null
    $archive = Join-Path $download ($name + '.zip')
    $checksums = Join-Path $download 'node-SHASUMS256.txt'
    Invoke-WebRequest "https://nodejs.org/dist/v$version/$name.zip" -OutFile $archive -UseBasicParsing
    Invoke-WebRequest "https://nodejs.org/dist/v$version/SHASUMS256.txt" -OutFile $checksums -UseBasicParsing
    $line = Get-Content -LiteralPath $checksums | Where-Object { $_ -match ('\s+' + [regex]::Escape($name + '.zip') + '$') }
    if (-not $line) { throw 'Node.js checksum is missing' }
    $expected = ($line -split '\s+')[0]
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node.js checksum mismatch' }
    Expand-Archive -LiteralPath $archive -DestinationPath $tools -Force
    $nodePath = Join-Path $tools "$name/node.exe"
}
$env:NODE_USE_ENV_PROXY = '1'
$arguments = @((Join-Path $PSScriptRoot 'install.mjs'))
if ($NoStart) { $arguments += '--no-start' }
& $nodePath @arguments
exit $LASTEXITCODE
