# Script to get push token from database or help extract it
# Usage: .\get-push-token.ps1 -PhoneNumber "YOUR_PHONE" or -Email "YOUR_EMAIL"

param(
    [Parameter(Mandatory=$false)]
    [string]$PhoneNumber,
    
    [Parameter(Mandatory=$false)]
    [string]$Email
)

Write-Host "To get your push token, you have two options:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option 1: From the App (Easiest)" -ForegroundColor Yellow
Write-Host "  1. Open your app (userApp or providerApp)" -ForegroundColor White
Write-Host "  2. Go to Profile/Settings" -ForegroundColor White
Write-Host "  3. Check the console logs - the push token is logged during initialization" -ForegroundColor White
Write-Host "  4. Or navigate to /debug-token screen (if added to your app)" -ForegroundColor White
Write-Host ""
Write-Host "Option 2: From Database" -ForegroundColor Yellow
Write-Host "  Run this SQL query on your database:" -ForegroundColor White
Write-Host "  SELECT upt.push_token, u.phone, u.email, upt.created_at" -ForegroundColor Gray
Write-Host "  FROM user_push_tokens upt" -ForegroundColor Gray
Write-Host "  JOIN users u ON u.id = upt.user_id" -ForegroundColor Gray
Write-Host "  WHERE upt.is_active = true" -ForegroundColor Gray
if ($PhoneNumber) {
    Write-Host "  AND u.phone = '$PhoneNumber'" -ForegroundColor Gray
}
if ($Email) {
    Write-Host "  AND u.email = '$Email'" -ForegroundColor Gray
}
Write-Host "  ORDER BY upt.created_at DESC" -ForegroundColor Gray
Write-Host "  LIMIT 1;" -ForegroundColor Gray
Write-Host ""
Write-Host "Once you have the push token, use this command to send a notification:" -ForegroundColor Cyan
Write-Host '  .\send-direct-notification.ps1 -PushToken "YOUR_PUSH_TOKEN"' -ForegroundColor Green

