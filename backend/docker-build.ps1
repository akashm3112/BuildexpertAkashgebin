# PowerShell script to build Docker image

Write-Host "🐳 Building BuildXpert Backend Docker image..." -ForegroundColor Cyan

# Build the image
docker build -t buildxpert-api:latest .

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Docker image built successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "To run the container:" -ForegroundColor Yellow
    Write-Host "  docker run -d --name buildxpert-api -p 5000:5000 -e DATABASE_URL='your_db_url' buildxpert-api:latest" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use docker-compose:" -ForegroundColor Yellow
    Write-Host "  docker-compose up -d" -ForegroundColor White
} else {
    Write-Host "❌ Docker build failed!" -ForegroundColor Red
    exit 1
}

