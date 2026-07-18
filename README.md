# VPS Monitoring

Lightweight VPS server monitoring console — metrics + chat logs viewer.

## Features

- **Real-time Metrics**: CPU, RAM, Disk, and Network usage via SSE.
- **Hermes Chat History**: Browse and search session logs from Hermes Agent.
- **Production App Status**: Check health of monitored services (Taka FinTrack, etc.).
- **History & Charts**: View resource usage history over 24h, 7d, or 30d.
- **Secure**: Rate-limited login, HttpOnly cookies, and read-only DB access.

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (read-only access to Hermes `state.db`)
- **Frontend**: Vanilla JS + CSS (SPA)

## API Documentation

- `GET /api/sessions`: Returns paginated list of chat sessions.
  - Query params: `source`, `limit`, `offset`, `q` (search).
  - Response: `{ data, total, page, pageSize, totalPages }`.
- `GET /api/sessions/:id`: Returns detail of a specific chat session.
  - Response: `{ id, source, user, title, messageCount, toolCount, parts, startedAt, lastAt, inputTokens, outputTokens }`.
- `GET /api/me`: Returns current auth status and user features.
- `GET /api/version`: Returns current package version.
- `GET /api/health`: Health status including DB latency.
- `GET /api/apps`: List monitored apps and their status (requires auth).
- `GET /api/apps/:id`: Returns detailed health information for a specific app (requires auth).
- `GET /api/config/apps`: List all monitored applications (requires auth).

## How to Build & Run

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Configure environment** (optional):
    Create a `.env` file or set environment variables:
    - `HM_PORT`: Server port (default: 3002)
    - `HM_ADMIN_USER`: Admin username (default: admin)
    - `HM_ADMIN_PASS`: Admin password (default: change-this-password)
    - `HM_STATE_DB`: Path to Hermes state.db
3.  **Start the server**:
    ```bash
    npm start
    ```
    The dashboard will be available at `http://localhost:3002`.
