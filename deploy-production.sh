#!/bin/bash

# Deployment script for airgen.studio

echo "🚀 Deploying AIRGen to production..."

# Resolve environment file (defaults to env/production.env)
ENV_FILE="${ENV_FILE:-env/production.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Missing environment file: $ENV_FILE"
  echo "   Create it from env/production.env.example before deploying."
  exit 1
fi

# Stop existing containers
docker-compose --env-file "$ENV_FILE" -f docker-compose.prod.yml down

# Build and start services
docker-compose --env-file "$ENV_FILE" -f docker-compose.prod.yml up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Show status
docker-compose --env-file "$ENV_FILE" -f docker-compose.prod.yml ps

echo "✅ Deployment complete!"
echo "🌐 Your app should be accessible at https://airgen.studio"
echo ""
echo "📝 Important reminders:"
echo "1. Make sure DNS is pointing to this server's IP"
echo "2. Update $ENV_FILE with your actual credentials"
echo "3. Let's Encrypt certificates will be auto-generated on first access"
