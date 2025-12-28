$token = "f9d8c7e6b5a49382716f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7980f1e2d3c"
$url = "https://buildexpertakashgebin.onrender.com/api/push-notifications/send-background-test"

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

$body = @{
    title = "Test Background Notification"
    body = "Testing background notifications - app should be closed!"
    template = "custom"
} | ConvertTo-Json

Write-Host "Sending notification..." -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body
    Write-Host "Success!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}

