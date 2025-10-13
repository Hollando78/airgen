#!/bin/bash

# AIRGen Production Deployment Script
# Generated: 2025-10-12

set -e  # Exit on error

echo "========================================="
echo "AIRGen Production Deployment to https://airgen.studio"
echo "========================================="
echo ""

# Verify .env.production exists
if [ ! -f ".env.production" ]; then
    echo "❌ Error: .env.production file not found!"
    exit 1
fi

echo "✅ Found .env.production file"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: docker-compose is not installed"
    exit 1
fi

echo "✅ Docker and docker-compose are installed"
echo ""

# Enable BuildKit for optimized builds with cache mounts
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "📦 Step 1: Stopping any existing containers..."
docker-compose -f docker-compose.prod.yml --env-file .env.production down || true
echo ""

echo "🏗️  Step 2: Building Docker images (optimized with cache)..."
echo "   Using BuildKit with layer caching and pnpm cache mounts"
docker-compose -f docker-compose.prod.yml --env-file .env.production build --build-arg BUILDKIT_INLINE_CACHE=1
echo "✅ Images built"
echo ""

echo "🚀 Step 3: Starting services..."
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
echo "✅ Services started"
echo ""

echo "⏳ Waiting for services to initialize..."
sleep 10
echo ""

echo "📊 Service Status:"
docker-compose -f docker-compose.prod.yml --env-file .env.production ps
echo ""

echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
echo "🌐 Application: https://airgen.studio"
echo "📊 Traefik:     https://airgen.studio/traefik"
echo ""
echo "📝 Useful commands:"
echo "   Logs:    docker-compose -f docker-compose.prod.yml logs -f"
echo "   Stop:    docker-compose -f docker-compose.prod.yml down"
echo "   Restart: docker-compose -f docker-compose.prod.yml restart"
echo "   Status:  docker-compose -f docker-compose.prod.yml ps"
echo ""
