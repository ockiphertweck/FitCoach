#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}FitCoach Setup${NC}"
echo "================================"

# Check Docker
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: Docker is not installed.${NC}"
  echo "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info &> /dev/null; then
  echo -e "${RED}Error: Docker daemon is not running.${NC}"
  echo "Please start Docker Desktop and try again."
  exit 1
fi

# Check pnpm
if ! command -v pnpm &> /dev/null; then
  echo -e "${RED}Error: pnpm is not installed.${NC}"
  echo "Install pnpm with: npm install -g pnpm"
  exit 1
fi

# Check .env
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}No .env file found. Creating from .env.example...${NC}"
  cp .env.example .env
  echo ""
  echo -e "${YELLOW}Please fill in the required values in .env:${NC}"
  echo "  JWT_SECRET         — run: openssl rand -base64 32"
  echo "  API_KEY_ENCRYPTION_KEY — run: openssl rand -base64 24 | head -c 32"
  echo "  DB_PASSWORD        — any secure password"
  echo "  STRAVA_CLIENT_ID   — from strava.com/settings/api"
  echo "  STRAVA_CLIENT_SECRET — from strava.com/settings/api"
  echo "  STRAVA_WEBHOOK_VERIFY_TOKEN — any random string"
  echo "  POSTHOG_API_KEY    — from posthog.com (optional)"
  echo ""
  echo "Then re-run: ./setup.sh"
  exit 0
fi

# Start containers
echo -e "${GREEN}Starting Docker containers...${NC}"
docker compose up -d --build

# Wait for Postgres
echo -n "Waiting for PostgreSQL"
TIMEOUT=30
ELAPSED=0
until docker compose exec postgres pg_isready -U fitcoach &> /dev/null; do
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo -e "\n${RED}Timeout waiting for PostgreSQL.${NC}"
    exit 1
  fi
  echo -n "."
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done
echo -e " ${GREEN}ready${NC}"

# Install dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
pnpm install

# Run migrations
echo -e "${GREEN}Running database migrations...${NC}"
pnpm --filter api db:migrate

echo ""
echo -e "${GREEN}FitCoach is running!${NC}"
echo "================================"
echo -e "  App:    ${GREEN}http://localhost:3001${NC}"
echo -e "  API:    ${GREEN}http://localhost:3000${NC}"
echo ""
echo "For pgAdmin + Tailscale Funnel (local dev):"
echo "  docker compose -f docker-compose.yml -f docker-compose.override.yml up -d"
echo "  Your public webhook URL: https://fitcoach-dev.<tailnet>.ts.net/strava/webhook"
