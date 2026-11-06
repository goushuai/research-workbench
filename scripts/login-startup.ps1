param([ValidateSet('Install', 'Remove', 'Status')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
$taskName = 'LocalResearchWorkbench'
if ($Action -eq 'Remove') {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output '已移除登录启动项'
    exit
}
if ($Action -eq 'Status') {
    Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Select-Object TaskName, State
    exit
}
$entry = Join-Path $PSScriptRoot 'start-background.ps1'
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $entry + '"'
$taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Select-Object TaskName, State
