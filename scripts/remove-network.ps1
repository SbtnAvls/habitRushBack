# HabitRush - Remove Network Setup
# Run this script as Administrator in PowerShell

param(
    [int]$Port = 3000
)

Write-Host "=== Removing HabitRush Network Setup ===" -ForegroundColor Cyan

# Remove port proxy rule
Write-Host "Removing port forwarding rule..." -ForegroundColor Yellow
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0

# Remove firewall rule
$ruleName = "HabitRush API (Port $Port)"
Write-Host "Removing firewall rule..." -ForegroundColor Yellow
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

Write-Host "`n=== Cleanup Complete ===" -ForegroundColor Green
