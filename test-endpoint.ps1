$url = "https://buildexpertakashgebin.onrender.com/api/push-notifications/send-by-phone"
$body = @{
    phone = "9639639633"
    title = "Test Notification"
    body = "Testing!"
    secretKey = "test123"
} | ConvertTo-Json

Write-Host "Testing endpoint..." -ForegroundColor Cyan
Write-Host "URL: $url" -ForegroundColor Gray
Write-Host "Body: $body" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers @{"Content-Type"="application/json"} -Body $body
    Write-Host "SUCCESS!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Error Status: $statusCode" -ForegroundColor Red
    
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $responseBody = $reader.ReadToEnd()
    Write-Host "Response Body:" -ForegroundColor Yellow
    Write-Host $responseBody
}

