# HabitRush - Network Setup Script for WSL2
# Run this script as Administrator in PowerShell

param(
    [int]$Port = 3000
)

Write-Host "=== HabitRush Network Setup ===" -ForegroundColor Cyan

# Get WSL IP
$wslIp = (wsl hostname -I).Trim().Split(' ')[0]
Write-Host "WSL IP: $wslIp" -ForegroundColor Yellow

# Get Windows local IP
$windowsIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.PrefixOrigin -eq 'Dhcp' } | Select-Object -First 1).IPAddress
if (-not $windowsIp) {
    $windowsIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' } | Select-Object -First 1).IPAddress
}
Write-Host "Windows IP: $windowsIp" -ForegroundColor Yellow

# Remove existing port proxy rule (if any)
Write-Host "`nRemoving existing port proxy rules..." -ForegroundColor Gray
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null

# Add port forwarding rule
Write-Host "Adding port forwarding: 0.0.0.0:$Port -> ${wslIp}:$Port" -ForegroundColor Green
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$wslIp

# Show current port proxy rules
Write-Host "`nCurrent port proxy rules:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4

# Add firewall rule
$ruleName = "HabitRush API (Port $Port)"
Write-Host "`nConfiguring firewall..." -ForegroundColor Green

# Remove existing rule if exists
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

# Add new firewall rule
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
Write-Host "Firewall rule '$ruleName' created" -ForegroundColor Green

Write-Host "`n=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "API accessible at:" -ForegroundColor White
Write-Host "  - Local:   http://localhost:$Port" -ForegroundColor Green
Write-Host "  - Network: http://${windowsIp}:$Port" -ForegroundColor Green
Write-Host "`nNote: Run this script again if WSL IP changes after reboot." -ForegroundColor Yellow
