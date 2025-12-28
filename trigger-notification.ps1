# PowerShell script to trigger background notification
# Usage: .\trigger-notification.ps1 -Token "YOUR_JWT_TOKEN"

param(
    [Parameter(Mandatory=$true)]
    [string]$Token,
    
    [Parameter(Mandatory=$false)]
    [string]$Title = "🧪 Test Background Notification",
    
    [Parameter(Mandatory=$false)]
    [string]$Body = "Testing background notifications - app should be closed!",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("custom", "booking", "reminder", "payment")]
    [string]$Template = "custom"
)

$apiUrl = "https://buildexpertakashgebin.onrender.com/api/push-notifications/send-background-test"

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $Token"
}

$body = @{
    title = $Title
    body = $Body
    template = $Template
} | ConvertTo-Json

Write-Host "Sending background test notification..." -ForegroundColor Cyan
Write-Host "API URL: $apiUrl" -ForegroundColor Gray
Write-Host "Template: $Template" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $body
    
    Write-Host "✅ Success!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 10
    
    Write-Host ""
    Write-Host "📱 Make sure your app is CLOSED to test background delivery!" -ForegroundColor Magenta
} catch {
    Write-Host "❌ Error sending notification:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
    }
}


