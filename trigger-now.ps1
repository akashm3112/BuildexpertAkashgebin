$url = "https://buildexpertakashgebin.onrender.com/api/push-notifications/send-by-phone"
$headers = @{"Content-Type" = "application/json"}
$body = @{
    phone = "9639639633"
    title = "🧪 Test Notification"
    body = "Testing background notifications! Check your phone!"
    secretKey = "test123"
} | ConvertTo-Json

Write-Host "Sending notification..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body
    Write-Host "Success!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
    Write-Host ""
    Write-Host "Check your phone - notification should arrive shortly!" -ForegroundColor Magenta
} catch {
    Write-Host "Error:" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Yellow
    if ($_.ErrorDetails.Message) {
        Write-Host ""
        Write-Host "Response Details:" -ForegroundColor Cyan
        try {
            $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
            $errorJson | ConvertTo-Json -Depth 10
        } catch {
            Write-Host $_.ErrorDetails.Message
        }
    }
    Write-Host ""
    Write-Host "Note: If you see 401, the backend may need to be deployed with the new endpoint." -ForegroundColor Gray
}

