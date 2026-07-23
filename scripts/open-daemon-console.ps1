<#
.SYNOPSIS
Opens the loopback-only Govee daemon console through an SSH tunnel.

.EXAMPLE
.\scripts\open-daemon-console.ps1 -SshHost raspberrypi
#>

[CmdletBinding()]
param(
    [string]$SshHost = 'raspberrypi',
    [ValidateRange(1, 65535)]
    [int]$LocalPort = 8788,
    [ValidateRange(1, 65535)]
    [int]$RemotePort = 8788,
    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-LocalPort {
    param([Parameter(Mandatory)][int]$Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.ConnectAsync('127.0.0.1', $Port)
        return $connection.Wait(250) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

$ssh = Get-Command ssh -ErrorAction Stop
$consoleUrl = "http://127.0.0.1:$LocalPort"

if (Test-LocalPort -Port $LocalPort) {
    Write-Host "A service is already listening on local port $LocalPort."
    if (-not $NoBrowser) {
        Start-Process -FilePath $consoleUrl
    }
    return
}

$forward = "${LocalPort}:127.0.0.1:${RemotePort}"
$sshArguments = @(
    '-o', 'BatchMode=yes',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-N',
    '-L', $forward,
    $SshHost
)

Write-Host "Opening a secure tunnel to $SshHost..."
$tunnel = Start-Process `
    -FilePath $ssh.Source `
    -ArgumentList $sshArguments `
    -PassThru `
    -WindowStyle Hidden

try {
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while (-not (Test-LocalPort -Port $LocalPort)) {
        if ($tunnel.HasExited) {
            throw "SSH exited before the tunnel was ready. Check the host alias and key-based authentication."
        }
        if ([DateTime]::UtcNow -ge $deadline) {
            throw "The SSH tunnel did not become ready within 15 seconds."
        }
        Start-Sleep -Milliseconds 250
    }

    Write-Host "Console ready at $consoleUrl"
    Write-Host 'Press Ctrl+C to close the tunnel.'
    if (-not $NoBrowser) {
        Start-Process -FilePath $consoleUrl
    }

    while (-not $tunnel.HasExited) {
        Start-Sleep -Seconds 1
    }
} finally {
    if (-not $tunnel.HasExited) {
        Stop-Process -Id $tunnel.Id
    }
}
