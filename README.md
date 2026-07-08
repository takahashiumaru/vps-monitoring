# Server Monitoring

Lightweight VPS monitoring dashboard built with Express + vanilla HTML/CSS/JS. It shows live CPU/RAM/disk metrics, production app health, resource history charts, and optional Hermes chat history.

## Features

- Live VPS metrics via SSE
- CPU/RAM/Disk history charts: 1 day, 1 week, 1 month
- Production app health cards with allowlisted start/stop/restart controls
- Safe VPS restart confirmation flow
- Optional Hermes chat history viewer
- Auto-hides Hermes/Chat UI when Hermes is not installed or `HM_STATE_DB` is missing
- Mobile-first UI, no React/Vite/build step

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/login` | — | Authenticate (rate-limited) |
| `POST` | `/api/logout` | — | Clear session cookie |
| `GET` | `/api/me` | — | Current auth status |
| `GET` | `/api/stats` | ✓ | Hermes DB statistics |
| `GET` | `/api/sessions` | ✓ | List chat sessions (paginated, searchable) |
| `GET` | `/api/sessions/:id/messages` | ✓ | Messages in a session |
| `GET` | `/api/metrics` | ✓ | One-shot live metrics snapshot |
| `GET` | `/api/metrics/stream` | ✓ | Live metrics over SSE |
| `POST` | `/api/metrics/reset` | ✓ | **Clear all stored metric history** |
| `GET` | `/api/history?range=1d` | ✓ | History chart data (`1d` / `7d` / `30d`) |
| `GET` | `/api/apps` | ✓ | Monitored app health |
| `POST` | `/api/apps/:id/restart` | ✓ | Restart an app (rate-limited) |
| `POST` | `/api/apps/:id/:action` | ✓ | Start / stop an app |
| `POST` | `/api/system/reboot` | ✓ | Reboot VPS (confirm: `RESTART SERVER`) |

### Reset history

Delete all stored metric samples (CPU/RAM/disk history charts will be empty until new data is collected):

```bash
# Requires a valid session cookie (log in first).
curl -b 'session=<token>' -X POST http://127.0.0.1:3002/api/metrics/reset
```

Response:

```json
{ "ok": true, "message": "History cleared" }
```

## Local run

### 1. Clone

```bash
git clone https://github.com/takahashiumaru/vps-monitoring.git
cd vps-monitoring
```

### 2. Install dependencies

Use Node.js 22 recommended. On macOS with Homebrew:

```bash
brew install node@22
brew unlink node || true
brew link --overwrite --force node@22
node -v
npm install
```

If Homebrew does not put `node@22` in your PATH, add this to `~/.zshrc` on Apple Silicon Macs:

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

For Intel Macs, use:

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"
```

### 3. Configure env

```bash
cp .env.example .env
```

Edit `.env`:

```env
HM_PORT=3002
HM_HOST=127.0.0.1
HM_ADMIN_USER=admin
HM_ADMIN_PASS=change-this-password
HM_SESSION_SECRET=change-this-long-random-string
HM_HISTORY_DB=./data/metrics-history.sqlite
```

Optional Hermes chat history:

```env
HM_STATE_DB=/home/ubuntu/.hermes/state.db
```

If `HM_STATE_DB` does not exist, the dashboard still runs and automatically hides the Chat/Hermes UI.

### 4. Start locally

```bash
npm start
```

Open:

```text
http://127.0.0.1:3002
```

Login with the user/password from `.env`.

## Local testing against the VPS

For local development without exposing SSH keys in the app, use an SSH tunnel:

```bash
ssh -i /path/to/key -N -L 3002:127.0.0.1:3002 ubuntu@43.133.155.252
```

Then open locally:

```text
http://127.0.0.1:3002
```

Do **not** embed a private SSH key into an iPhone/mobile app. For mobile builds, point the WebView/PWA to the secured VPS dashboard URL instead.

## Build iPhone app on MacBook

This repo includes Capacitor config that wraps the secured production dashboard:

```text
https://monitor.takahashiumaru.web.id
```

Requirements on MacBook:

- Node.js 20+
- Xcode installed from the App Store
- Apple ID logged in inside Xcode
- iPhone connected by cable or available via Wi-Fi debugging

Run:

```bash
git clone https://github.com/takahashiumaru/vps-monitoring.git
cd vps-monitoring
npm install
npm run mobile:sync
npm run ios:open
```

Then in Xcode:

1. Select your iPhone as the target device.
2. Open **Signing & Capabilities**.
3. Enable **Automatically manage signing**.
4. Pick your Apple ID / Team.
5. Press **Run**.

If Xcode says the iOS platform does not exist, run:

```bash
npm run ios:add
npm run mobile:sync
npm run ios:open
```

If iPhone says **Untrusted Developer**, open iPhone Settings → General → VPN & Device Management, then trust your Apple ID.

## Production systemd example

Create a user service like:

```ini
[Unit]
Description=Server Monitoring
After=network-online.target

[Service]
WorkingDirectory=/home/ubuntu/hermes-monitor
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
MemoryMax=120M
CPUQuota=15%
TasksMax=32
EnvironmentFile=/home/ubuntu/hermes-monitor/.env

[Install]
WantedBy=default.target
```

Then:

```bash
systemctl --user daemon-reload
systemctl --user enable --now server-monitoring.service
```

## Security notes

- Keep `.env` private and never commit it.
- App/system controls are allowlisted in code; do not add arbitrary shell execution.
- Use HTTPS + strong password before exposing publicly.
- Prefer backend-on-VPS for control actions; avoid shipping SSH keys to clients.
