# Script to send notification using phone number
# Usage: .\send-by-phone.ps1 -Phone "YOUR_PHONE_NUMBER"

param(
    [Parameter(Mandatory=$true)]
    [string]$Phone,
    
    [Parameter(Mandatory=$false)]
    [string]$Title = "🧪 Test Notification",
    
    [Parameter(Mandatory=$false)]
    [string]$Body = "Testing background notifications!",
    
    [Parameter(Mandatory=$false)]
    [string]$SecretKey = "test123"
)

$url = "https://buildexpertakashgebin.onrender.com/api/push-notifications/send-by-phone"

$headers = @{
    "Content-Type" = "application/json"
}

$body = @{
    phone = $Phone
    title = $Title
    body = $Body
    secretKey = $SecretKey
} | ConvertTo-Json

Write-Host "Sending notification to phone: $Phone" -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body
    
    Write-Host "✅ Success! Notification sent!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Yellow
    $response | ConvertTo-Json -Depth 10
    
    Write-Host ""
    Write-Host "📱 Check your phone - you should receive the notification!" -ForegroundColor Magenta
    Write-Host "   (Make sure the app is CLOSED to test background delivery)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Error sending notification:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host ""
        Write-Host "Details:" -ForegroundColor Yellow
        try {
            $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json
            $errorDetails | ConvertTo-Json -Depth 10
        } catch {
            Write-Host $_.ErrorDetails.Message
        }
    }
}

