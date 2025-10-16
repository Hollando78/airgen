#!/bin/bash

# AIRGen Production Deployment Script (Enhanced)
# Supports selective service updates for faster deployments

set -e  # Exit on error

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
HEALTH_CHECK_TIMEOUT=60

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
DEPLOY_MODE="${1:-full}"  # full, api, frontend, quick
SKIP_BUILD="${2:-false}"

echo "========================================="
echo "AIRGen Production Deployment"
echo "Mode: $DEPLOY_MODE"
echo "========================================="
echo ""

# Verify .env.production exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Error: $ENV_FILE file not found!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found $ENV_FILE file${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Error: Docker is not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Error: docker-compose is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker and docker-compose are installed${NC}"
echo ""

# Enable BuildKit for optimized builds
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Function to wait for service health
wait_for_service() {
    local service=$1
    local timeout=$2
    local elapsed=0

    echo -e "${BLUE}⏳ Waiting for $service to be healthy...${NC}"

    while [ $elapsed -lt $timeout ]; do
        if docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE ps $service | grep -q "Up"; then
            echo -e "${GREEN}✅ $service is healthy${NC}"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    echo -e "${RED}❌ Timeout waiting for $service${NC}"
    return 1
}

# Function to build and deploy a service
deploy_service() {
    local service=$1

    echo -e "${BLUE}🏗️  Building $service...${NC}"
    docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE build --build-arg BUILDKIT_INLINE_CACHE=1 $service

    echo -e "${BLUE}🚀 Deploying $service...${NC}"
    docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --no-deps $service

    wait_for_service $service 30
}

case $DEPLOY_MODE in
    "api"|"backend")
        echo -e "${YELLOW}📦 API-only deployment (faster, zero downtime)${NC}"
        echo ""

        deploy_service "api"

        echo ""
        echo -e "${GREEN}=========================================${NC}"
        echo -e "${GREEN}✅ API Deployment Complete!${NC}"
        echo -e "${GREEN}=========================================${NC}"
        ;;

    "frontend"|"ui")
        echo -e "${YELLOW}📦 Frontend-only deployment (faster)${NC}"
        echo ""

        deploy_service "frontend"

        echo ""
        echo -e "${GREEN}=========================================${NC}"
        echo -e "${GREEN}✅ Frontend Deployment Complete!${NC}"
        echo -e "${GREEN}=========================================${NC}"
        ;;

    "quick")
        echo -e "${YELLOW}📦 Quick deployment (API + Frontend, keep DBs running)${NC}"
        echo ""

        # Build both in parallel
        echo -e "${BLUE}🏗️  Building API and Frontend in parallel...${NC}"
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE build --build-arg BUILDKIT_INLINE_CACHE=1 api frontend &
        BUILD_PID=$!

        wait $BUILD_PID

        # Deploy API first, then frontend
        echo -e "${BLUE}🚀 Deploying API...${NC}"
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --no-deps api

        echo -e "${BLUE}🚀 Deploying Frontend...${NC}"
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --no-deps frontend

        wait_for_service "api" 30
        wait_for_service "frontend" 30

        echo ""
        echo -e "${GREEN}=========================================${NC}"
        echo -e "${GREEN}✅ Quick Deployment Complete!${NC}"
        echo -e "${GREEN}=========================================${NC}"
        ;;

    "full"|*)
        echo -e "${YELLOW}📦 Full deployment (all services)${NC}"
        echo ""

        echo -e "${BLUE}📦 Step 1: Stopping existing application services...${NC}"
        # Only stop app services, keep databases running
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE stop api frontend 2>/dev/null || true
        echo ""

        echo -e "${BLUE}🏗️  Step 2: Building Docker images (optimized with cache)...${NC}"
        echo "   Using BuildKit with layer caching and pnpm cache mounts"
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE build --build-arg BUILDKIT_INLINE_CACHE=1
        echo -e "${GREEN}✅ Images built${NC}"
        echo ""

        echo -e "${BLUE}🚀 Step 3: Starting all services...${NC}"
        docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d
        echo -e "${GREEN}✅ Services started${NC}"
        echo ""

        echo -e "${BLUE}⏳ Waiting for services to initialize...${NC}"
        wait_for_service "postgres" 30
        wait_for_service "redis" 20
        wait_for_service "neo4j" 60
        wait_for_service "api" 30
        wait_for_service "frontend" 20
        echo ""

        echo -e "${GREEN}=========================================${NC}"
        echo -e "${GREEN}✅ Full Deployment Complete!${NC}"
        echo -e "${GREEN}=========================================${NC}"
        ;;
esac

echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
docker-compose -f $COMPOSE_FILE --env-file $ENV_FILE ps
echo ""

echo -e "${GREEN}🌐 Application: https://airgen.studio${NC}"
echo -e "${BLUE}📊 Traefik:     https://airgen.studio/traefik${NC}"
echo ""
echo -e "${YELLOW}📝 Useful commands:${NC}"
echo "   Logs (all):     docker-compose -f $COMPOSE_FILE logs -f"
echo "   Logs (api):     docker-compose -f $COMPOSE_FILE logs -f api"
echo "   Logs (frontend): docker-compose -f $COMPOSE_FILE logs -f frontend"
echo "   Stop:           docker-compose -f $COMPOSE_FILE down"
echo "   Restart:        docker-compose -f $COMPOSE_FILE restart"
echo "   Status:         docker-compose -f $COMPOSE_FILE ps"
echo ""
echo -e "${YELLOW}⚡ Quick deploy options:${NC}"
echo "   API only:       ./deploy-production.sh api"
echo "   Frontend only:  ./deploy-production.sh frontend"
echo "   Quick (no DB):  ./deploy-production.sh quick"
echo "   Full rebuild:   ./deploy-production.sh full"
echo ""
