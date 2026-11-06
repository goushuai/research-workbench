param([ValidateSet('start', 'stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$source = Split-Path $PSScriptRoot -Parent
$deployment = if ($env:WORKBENCH_DEPLOY_DIR) { $env:WORKBENCH_DEPLOY_DIR } else { $source + '-deploy' }
$manifest = Join-Path $deployment 'deployment.json'
if (-not (Test-Path -LiteralPath $manifest)) { throw 'Please run Install.cmd first' }
$settings = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
$env:WORKBENCH_DEPLOY_DIR = $deployment
& $settings.node (Join-Path $deployment "app/scripts/$Action.mjs")
exit $LASTEXITCODE
