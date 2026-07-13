# VPS Monitoring

Lightweight VPS server monitoring console — metrics + chat logs viewer.

## API Documentation

- `GET /api/sessions`: Returns paginated list of chat sessions.
  - Query params: `source`, `limit`, `offset`, `q` (search).
  - Response: `{ data, total, page, pageSize, totalPages }`.
- `GET /api/me`: Returns current auth status and user features.
- `GET /api/version`: Returns current package version.
- `GET /api/health`: Health status including DB latency.

## How to Build

1. `npm install`
2. `npm start` (Runs the server)
