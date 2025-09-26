#!/bin/bash

# Deployment script for airgen.studio

echo "🚀 Deploying AIRGen to production..."

# Load production environment
cp .env.production .env

# Stop existing containers
docker-compose -f docker-compose.prod.yml down

# Build and start services
docker-compose -f docker-compose.prod.yml up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Show status
docker-compose -f docker-compose.prod.yml ps

echo "✅ Deployment complete!"
echo "🌐 Your app should be accessible at https://airgen.studio"
echo ""
echo "📝 Important reminders:"
echo "1. Make sure DNS is pointing to this server's IP"
echo "2. Update .env.production with your actual credentials"
echo "3. Let's Encrypt certificates will be auto-generated on first access"