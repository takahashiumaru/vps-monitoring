# VPS Monitoring Console

Lightweight dashboard for monitoring VPS status (CPU, RAM, Disk, Load) and managing services via Systemd.

## Stack
- Backend: Node.js + Express
- Database: SQLite (via better-sqlite3)
- Frontend: Simple SPA (Vanilla JS + HTML)

## API
- `GET /api/health` — status, version, DB health
- `GET /api/me` — current user
- `GET /api/sessions` — paginated chat history list (params: limit, page, q, source)
- `GET /api/sessions/:id` — get chat session detail
- `GET /api/sessions/:id/messages` — get chat messages for session
- `GET /api/config` — general runtime config (session TTL, metrics interval)
- `GET /api/stats` — Hermes DB summary stats
- `POST /api/login` / `POST /api/logout`
- `GET /api/features` — feature flags
- `GET /api/config/apps` — apps config
- `GET /api/metrics` — latest snapshot
- `GET /api/metrics/stream` — SSE stream
- `POST /api/metrics/reset` — clear history
- `GET /api/history?range=1d|7d|30d` — historical samples
- `GET /api/apps` — list apps with health
- `GET /api/apps/:id` — single app health
- `POST /api/apps/:id/restart|start|stop` — control apps
- `GET /api/routes` — list registered routes
- `POST /api/system/reboot` — reboot VPS (requires confirm="RESTART SERVER")
- `GET /api/apps` — list managed services
- `POST /api/apps/:id/:action` — control app action (start, stop, restart)

## Configuration
Edit `.env` (see `.env.example` if present) or `config.js`.

## Installation
```bash
npm install
```

## Running
```bash
npm start
```
