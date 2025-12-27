#!/bin/bash
# Build script for Docker image

echo "🐳 Building BuildXpert Backend Docker image..."

# Build the image
docker build -t buildxpert-api:latest .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully!"
    echo ""
    echo "To run the container:"
    echo "  docker run -d --name buildxpert-api -p 5000:5000 -e DATABASE_URL='your_db_url' buildxpert-api:latest"
    echo ""
    echo "Or use docker-compose:"
    echo "  docker-compose up -d"
else
    echo "❌ Docker build failed!"
    exit 1
fi

