# VPS Monitoring Console

Lightweight dashboard for monitoring VPS status (CPU, RAM, Disk, Load) and managing services via Systemd.

## Stack
- Backend: Node.js + Express
- Database: SQLite (via better-sqlite3)
- Frontend: Simple SPA (Vanilla JS + HTML)

## Setup
1. `npm install`
2. `cp .env.example .env` (configure HM_ADMIN_USER, HM_ADMIN_PASS, HM_STATE_DB_PATH)
3. `npm start`
