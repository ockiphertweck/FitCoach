# FitCoach

A self-hosted, open-source AI training coach. Connects to Strava, stores all data locally, and uses the Claude API (bring-your-own-key) to provide rest/train recommendations, coaching chat, and weekly trend analysis.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        docker compose                           │
│                                                                 │
│  ┌───────────────┐    ┌────────────────┐    ┌───────────────┐  │
│  │   Frontend    │    │      API       │    │  PostgreSQL   │  │
│  │  Next.js 15   │───▶│  Fastify v5    │───▶│  pgvector     │  │
│  │  port 3001    │    │  port 3000     │    │  pgcrypto     │  │
│  └───────────────┘    └───────┬────────┘    └───────────────┘  │
│                               │                                 │
│                    ┌──────────┴──────────┐                      │
│                    ▼                     ▼                      │
│             ┌────────────┐      ┌──────────────┐               │
│             │  Strava    │      │  Claude API   │               │
│             │  OAuth2 +  │      │  (your key)   │               │
│             │  Webhooks  │      └──────────────┘               │
│             └────────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — for running all services
- [pnpm](https://pnpm.io/installation) — `npm install -g pnpm`
- [Node.js 22 LTS](https://nodejs.org/) — or use `nvm use` in the repo root

## Quickstart

```bash
git clone https://github.com/your-username/fitcoach
cd fitcoach
chmod +x setup.sh
./setup.sh
```

The setup script will:
1. Check Docker and pnpm are installed
2. Copy `.env.example` → `.env` on first run (fill in required values, then re-run)
3. Start all containers with `docker compose up -d --build`
4. Wait for PostgreSQL to be healthy
5. Install dependencies and run database migrations

## Environment variables

| Variable | Description |
|---|---|
| `JWT_SECRET` | Random secret for JWT signing (`openssl rand -base64 32`) |
| `API_KEY_ENCRYPTION_KEY` | 32-char key for AES-256-GCM encryption (`openssl rand -base64 24 \| head -c 32`) |
| `DB_PASSWORD` | PostgreSQL password |
| `STRAVA_CLIENT_ID` | From [strava.com/settings/api](https://www.strava.com/settings/api) |
| `STRAVA_CLIENT_SECRET` | From [strava.com/settings/api](https://www.strava.com/settings/api) |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Any random string you choose |
| `CLAUDE_API_KEY` | Optional at setup — can be entered via Settings UI |
| `POSTHOG_API_KEY` | Optional — from [posthog.com](https://posthog.com) (EU region) |
| `TS_AUTHTOKEN` | Tailscale auth key for receiving Strava webhooks locally |

## Connecting Strava

1. Register an app at [strava.com/settings/api](https://www.strava.com/settings/api)
   - Set Authorization Callback Domain to `localhost`
2. Fill `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in `.env`
3. Open FitCoach → Settings → Connect Strava

### Strava webhooks in local dev (Tailscale Funnel)

Strava needs a public HTTPS URL to push activity events. Tailscale Funnel handles this without a third-party tunnel service.

**Prerequisites:**
- Tailscale installed on your machine (tailscale.com/download)
- Funnel enabled for your tailnet: [tailscale.com/admin/dns](https://login.tailscale.com/admin/dns) → Enable Funnel
- An auth key (reusable + ephemeral): [tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys)

**Start the dev stack with Funnel:**

```bash
# Add TS_AUTHTOKEN to .env, then:
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

This starts a Tailscale container in the same network namespace as the API and exposes it via Funnel. Your public URL will be:

```
https://fitcoach-dev.<tailnet>.ts.net
```

**Register the webhook with Strava** (run once):

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://fitcoach-dev.<tailnet>.ts.net/strava/webhook \
  -F verify_token=YOUR_STRAVA_WEBHOOK_VERIFY_TOKEN
```

> **Note:** The Tailscale container hostname `fitcoach-dev` is set in `docker-compose.override.yml`. If you change it, update `tailscale/ts-serve.json` to match.

## Local dev (without Docker)

```bash
pnpm install
# Start PostgreSQL separately, then:
pnpm dev
```

## Data privacy (DSGVO / GDPR)

FitCoach is **fully self-hosted** — all data (activities, chat history, credentials) is stored in your local PostgreSQL database. No data is stored on any external server except:

- **Claude API**: Your recent activities and chat messages are sent to Anthropic's Claude API to generate AI responses. Anthropic's [privacy policy](https://www.anthropic.com/privacy) applies.
- **PostHog**: Optional usage analytics (no personal health data) sent to PostHog EU servers.
- **Strava**: Activity data is fetched from Strava's API and stored locally.

### Deleting your data

- **Chat history**: `DELETE /ai/chat/history` or via the Settings UI
- **Activities**: Connect to the database (`docker compose exec postgres psql -U fitcoach`) and run `DELETE FROM activities;`
- **Full account deletion**: Stop containers, run `docker compose down -v` to remove all data volumes

## Development tools

- **pgAdmin** (database UI): `http://localhost:5050` — start with `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d`
- **Tailscale Funnel status**: `docker compose -f docker-compose.yml -f docker-compose.override.yml logs tailscale`
- **Drizzle Studio**: `pnpm --filter api db:studio`
