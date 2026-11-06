$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $project
& (Join-Path $PSScriptRoot 'launch.ps1') start
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
