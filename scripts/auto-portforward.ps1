# HabitRush - Auto Port Forward on WSL Start
# Add this to Windows Task Scheduler to run at login
# Run as: powershell.exe -ExecutionPolicy Bypass -File "C:\development\back\habitRushBack\scripts\auto-portforward.ps1"

$Port = 3000
$LogFile = "$env:TEMP\habitrush-portforward.log"

function Write-Log {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Out-File -Append $LogFile
}

Write-Log "Starting auto port forward..."

# Wait for WSL to be ready
$maxAttempts = 30
$attempt = 0
$wslIp = $null

while ($attempt -lt $maxAttempts -and -not $wslIp) {
    try {
        $wslIp = (wsl hostname -I 2>$null).Trim().Split(' ')[0]
        if ($wslIp -match '^\d+\.\d+\.\d+\.\d+$') {
            break
        }
        $wslIp = $null
    } catch {}

    $attempt++
    Start-Sleep -Seconds 2
}

if (-not $wslIp) {
    Write-Log "ERROR: Could not get WSL IP after $maxAttempts attempts"
    exit 1
}

Write-Log "WSL IP: $wslIp"

# Update port forwarding
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$wslIp

Write-Log "Port forwarding updated: 0.0.0.0:$Port -> ${wslIp}:$Port"

# Start PM2 in WSL if not running
wsl -e bash -c "pm2 ping > /dev/null 2>&1 || pm2 resurrect"
Write-Log "PM2 check completed"

Write-Log "Auto port forward complete"
