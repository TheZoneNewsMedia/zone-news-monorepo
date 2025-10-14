#!/bin/bash

echo "🐳 Deploying Zone News with Docker"
echo "==================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "📦 Building Docker images..."
docker-compose build

echo ""
echo "🚀 Starting services..."
docker-compose up -d

echo ""
echo "📊 Checking service status..."
docker-compose ps

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Access points:"
echo "• Mini App: http://localhost"
echo "• Admin: http://localhost/admin"
echo "• API: http://localhost:3001"
echo "• Bot: http://localhost:3002"
echo "• CMS: http://localhost:1337"
echo "• MongoDB: localhost:27017"
echo "• Redis: localhost:6379"
echo ""
echo "📝 Useful commands:"
echo "• View logs: docker-compose logs -f [service]"
echo "• Stop services: docker-compose down"
echo "• Restart service: docker-compose restart [service]"
echo "• Enter container: docker exec -it [container] sh"
echo ""
echo "Services: api, bot, cms, miniapp, mongodb, redis, nginx"