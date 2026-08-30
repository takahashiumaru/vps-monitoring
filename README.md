# VPS Monitoring Console

Lightweight dashboard for monitoring VPS status (CPU, RAM, Disk, Load) and managing services via Systemd.

## Stack
- Backend: Node.js + Express
- Database: SQLite (via better-sqlite3)
- Frontend: Simple SPA (Vanilla JS + HTML)

## API Reference
- `GET /api/health` — Returns application status, version, uptime, memory, and database health (200 OK, 503 if degraded)
- `GET /api/me` — Returns the current authenticated user and enabled feature flags
- `GET /api/routes` — Returns a list of dynamically registered Express routes
- `GET /api/features` — Returns active system feature flags
- `GET /api/stats` — Returns Hermes DB summary stats (tokens, messages, session counts)
- `GET /api/sessions` — Paginated chat history list (query params: `limit`, `page`, `q`, `source`)
- `GET /api/sessions/:id` — Returns detail summary for a specific chat session group (404 if not found)
- `GET /api/sessions/:id/messages` — Returns chat messages for a specific session group
- `GET /api/config` — Returns general runtime config (session TTL, metrics interval)
- `GET /api/config/apps` — Returns monitored applications configuration
- `GET /api/metrics` — One-shot system metrics snapshot (CPU, RAM, Disk)
- `GET /api/metrics/stream` — Live Server-Sent Events (SSE) metrics stream
- `POST /api/metrics/reset` — Clears cached metrics history
- `GET /api/history` — Historical metric samples (query params: `range=1d|7d|30d`)
- `GET /api/apps` — List monitored application services with live health checks
- `GET /api/apps/:id` — Single monitored application service health check
- `POST /api/apps/:id/restart` — Restart an application service via Systemd
- `POST /api/apps/:id/:action` — Control an application service (`start` or `stop`)
- `POST /api/login` — Authenticate and issue signed session cookie (401 on failure)
- `POST /api/logout` — Clear authenticated session cookie
- `POST /api/system/reboot` — Reboot VPS gracefully (requires body payload: `{"confirm": "RESTART SERVER"}`) (400 if bad confirmation)

## Managed Applications
The console monitors and controls:
- **Taka FinTrack**: Next.js personal finance app (`taka-fintrack.service`)
- **Project Work UAPS**: PHP 8.3 FPM service (`php8.3-fpm.service` + `nginx.service`)
- **9Router AI Gateway**: Local AI routing gateway on port 20128 (`9router.service`)
- **Hermes Gateway**: Messaging platform bridge on port 9119 (`hermes-gateway.service`)

## Configuration
Edit `.env` (see `.env.example` if present) or modify `config.js`.

## Installation
```bash
npm install
```

## Running
```bash
npm start
```
