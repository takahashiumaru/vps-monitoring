# Server Monitoring System Control + App Health + History Charts Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add safe server/app restart controls, production app up/down monitoring, and lightweight CPU/RAM/disk history charts for 1 day / 1 week / 1 month.

**Architecture:** Keep Server Monitoring lightweight: no React/Vite, no chart libraries, no heavy database server. Add a tiny local SQLite metrics store, sampled by the existing Node service at a calm interval. Add protected API endpoints for app health/status, restart actions, and history ranges. Render charts with vanilla SVG/canvas in the existing frontend.

**Tech Stack:** Express, vanilla JS/CSS, better-sqlite3, systemd user services, Node child_process with allowlisted commands, existing signed-cookie auth.

---

## Current baseline from inspection

- Project path: `/home/ubuntu/hermes-monitor`
- Public service: `server-monitoring.service` on port `3002`
- Current resource guardrails: `MemoryMax=120M`, `CPUQuota=15%`, `TasksMax=32`
- Current monitored-ish services found:
  - `https://takahashiumaru.my.id/` (Taka FinTrack) returned HTTP 200; Nginx proxies it to `127.0.0.1:3001`, backed by `taka-fintrack.service`.
  - `https://apsone.web.id/` (Project Work UAPS / APS One) returned HTTP 200; Nginx serves Laravel from `/home/ubuntu/project-work-uaps/public` through PHP-FPM `php8.3-fpm`.
  - `server-monitoring.service` running, port `3002`.
  - `taka-school.service` exists but is **not** one of the requested monitored production apps and should not be shown for this feature.
- Important safety rule: do not add broad shell execution. Only allow specific restart/reboot commands from a fixed allowlist.

---

## Acceptance criteria

1. **System tab controls**
   - Shows a “Restart VPS” action in System.
   - Uses a strong confirmation flow, not one-tap restart.
   - Returns a clear response before reboot starts.
   - Does not expose arbitrary shell commands.

2. **Production app health panel**
   - Shows app cards for:
     - Taka FinTrack (`https://takahashiumaru.my.id/`)
     - Project Work UAPS / APS One (`https://apsone.web.id/`)
   - Each card shows: status up/down, HTTP code, latency, service active state, port, last checked time.
   - If an app is down, visual state is obvious but not noisy.
   - Optional per-app restart button can be included, but also protected by confirmation.

3. **History charts**
   - Tracks CPU %, RAM %, disk % over time.
   - Range selector: 1 day, 1 week, 1 month.
   - Uses downsampled data to stay lightweight.
   - Uses vanilla SVG/canvas, no chart package.
   - Store stays bounded and cannot grow forever.

4. **VPS safety**
   - Sampling interval should be calm: default 60s for historical samples.
   - Disk writes should be tiny.
   - Keep service memory below current cap.
   - Existing live metrics SSE remains 5s.

5. **Verification**
   - Syntax check JS files.
   - Restart `server-monitoring.service` only after code passes.
   - Verify auth/API codes, service active, memory, and UI asset version.
   - Do not reboot VPS during verification unless Umar explicitly approves after seeing the confirmation UI.

---

## Task 1: Add configurable monitored app registry

**Objective:** Define a single allowlisted source of apps/services that can be checked or restarted.

**Files:**
- Modify: `/home/ubuntu/hermes-monitor/config.js`
- Optional docs: `/home/ubuntu/hermes-monitor/docs/APP_REGISTRY.md`

**Implementation notes:**

Add `monitoredApps` config similar to:

```js
monitoredApps: [
  {
    id: 'taka-fintrack',
    name: 'Taka FinTrack',
    service: 'taka-fintrack.service',
    serviceScope: 'user',
    url: 'http://127.0.0.1:3001/',
    publicUrl: 'https://takahashiumaru.my.id/',
    timeoutMs: 2500,
    restartable: true,
  },
  {
    id: 'apsone',
    name: 'Project Work UAPS',
    service: 'php8.3-fpm.service',
    serviceScope: 'system',
    url: 'https://apsone.web.id/',
    publicUrl: 'https://apsone.web.id/',
    rootPath: '/home/ubuntu/project-work-uaps/public',
    timeoutMs: 3500,
    // Restarting this app means restarting shared PHP-FPM/nginx stack; keep disabled
    // unless Umar explicitly wants a web-stack restart button.
    restartable: false,
  },
]
```

**Important:** `Project Work UAPS` is **not** `taka-school.service`. It is the Laravel/PHP site at `https://apsone.web.id/`, served from `/home/ubuntu/project-work-uaps/public` via Nginx + PHP-FPM.

**Verification:**
- Run `node -e "console.log(require('./config').monitoredApps)"`.
- Expected: two app objects printed without secrets.

---

## Task 2: Build app health checker module

**Objective:** Check HTTP health and systemd service state without shell injection.

**Files:**
- Create: `/home/ubuntu/hermes-monitor/lib/apps.js`
- Modify: `/home/ubuntu/hermes-monitor/server.js`

**Implementation details:**

`lib/apps.js` should expose:

```js
async function listAppHealth() {}
async function restartApp(appId) {}
```

Health data shape:

```json
{
  "id": "taka-fintrack",
  "name": "Taka FinTrack",
  "status": "up",
  "httpCode": 200,
  "latencyMs": 42,
  "serviceActive": "active",
  "serviceSub": "running",
  "checkedAt": 1710000000000,
  "restartable": true
}
```

Use Node `http` / `https` modules or global `fetch` with `AbortController` timeout.

For service state, use fixed argument arrays. User services use `systemctl --user`; system services use `systemctl` without `--user`:

```js
const args = app.serviceScope === 'user'
  ? ['--user', 'show', app.service, '-p', 'ActiveState', '-p', 'SubState', '--value']
  : ['show', app.service, '-p', 'ActiveState', '-p', 'SubState', '--value'];
spawnFile('systemctl', args);
```

No string-concatenated shell commands.

**API endpoints:**
- `GET /api/apps` → list health
- `POST /api/apps/:id/restart` → restart allowlisted app service only when `restartable=true`

**Verification:**
- Authenticated `GET /api/apps` returns array.
- Unauthenticated returns 401.
- Unknown app restart returns 404.
- Restart endpoint should not run until UI confirmation is implemented or manual test is explicitly approved.

---

## Task 3: Add safe server reboot action

**Objective:** Add a protected endpoint for reboot with strict confirmation and allowlisted command.

**Files:**
- Create or modify: `/home/ubuntu/hermes-monitor/lib/system-actions.js`
- Modify: `/home/ubuntu/hermes-monitor/server.js`
- Potential system file: `/etc/sudoers.d/server-monitoring-reboot` only if needed and only with explicit approval

**Endpoint:**
- `POST /api/system/reboot`

**Request body:**

```json
{ "confirm": "RESTART SERVER" }
```

**Behavior:**
- If confirm text is missing/wrong → 400.
- If correct → respond `{ ok: true, message: 'Reboot scheduled' }`, then call reboot after ~500ms.
- Use one fixed command only, e.g. `/usr/bin/systemctl reboot` or `/sbin/reboot`.

**Privilege options:**
1. If user service has passwordless sudo for reboot already, use it.
2. If not, add narrow sudoers entry only for reboot:
   - `ubuntu ALL=(root) NOPASSWD: /usr/bin/systemctl reboot, /sbin/reboot`
3. Never add `NOPASSWD: ALL`.

**UI safety:**
- Button label: “Restart VPS”
- Modal / inline confirmation requires typing `RESTART SERVER`.
- Show warning: dashboard will go offline while VPS reboots.

**Verification:**
- Test wrong confirm returns 400.
- Test auth required returns 401.
- Do not execute real reboot until Umar explicitly says yes.

---

## Task 4: Add lightweight metrics history store

**Objective:** Persist historical CPU/RAM/disk samples for charts without overloading disk/RAM.

**Files:**
- Create: `/home/ubuntu/hermes-monitor/lib/history.js`
- Modify: `/home/ubuntu/hermes-monitor/config.js`
- Modify: `/home/ubuntu/hermes-monitor/server.js`
- Create runtime DB: `/home/ubuntu/hermes-monitor/data/metrics-history.sqlite`

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS metric_samples (
  ts INTEGER PRIMARY KEY,
  cpu REAL NOT NULL,
  ram REAL NOT NULL,
  disk REAL NOT NULL,
  load1 REAL,
  load5 REAL,
  load15 REAL
);
CREATE INDEX IF NOT EXISTS metric_samples_ts_idx ON metric_samples(ts);
```

**Sampling:**
- Default interval: 60 seconds.
- Keep 35 days max.
- On startup, start one `setInterval` sampler.
- Use existing `metrics.snapshot()` so there is no duplicate `/proc` parsing logic.

**Retention:**
- Delete `WHERE ts < Date.now() - 35 days` once per hour.

**API:**
- `GET /api/history?range=1d|7d|30d`

**Downsampling:**
- 1d: max ~288 points (5-minute buckets)
- 7d: max ~336 points (30-minute buckets)
- 30d: max ~360 points (2-hour buckets)

**Verification:**
- Insert one sample immediately on service start.
- `GET /api/history?range=1d` returns arrays for cpu/ram/disk.
- DB file remains tiny.

---

## Task 5: Add charts to frontend System tab

**Objective:** Show CPU/RAM/disk usage trend with range selector.

**Files:**
- Modify: `/home/ubuntu/hermes-monitor/public/index.html`
- Modify: `/home/ubuntu/hermes-monitor/public/app.js`
- Modify: `/home/ubuntu/hermes-monitor/public/styles.css`

**UI design:**
- In System tab, add section: “Riwayat resource”.
- Range segmented control: `1 Hari`, `1 Minggu`, `1 Bulan`.
- Three compact chart cards:
  - CPU usage
  - RAM usage
  - Disk usage
- Use vanilla SVG polyline or canvas.
- No external chart dependencies.

**Lightweight SVG approach:**
- Generate `<svg viewBox="0 0 320 110">`.
- Compute x/y in JS.
- Use one `polyline` per metric.
- Show current/max/avg numbers as text outside the SVG.

**Verification:**
- Switch 1d/7d/30d without page reload.
- Empty history state is friendly.
- No horizontal overflow on mobile.

---

## Task 6: Add app health cards to frontend System tab

**Objective:** Show Taka FinTrack and Project Work UAPS up/down state in the System tab.

**Files:**
- Modify: `/home/ubuntu/hermes-monitor/public/index.html`
- Modify: `/home/ubuntu/hermes-monitor/public/app.js`
- Modify: `/home/ubuntu/hermes-monitor/public/styles.css`

**UI fields:**
- App name
- Status badge: UP / DOWN / DEGRADED
- HTTP code
- Latency
- Service state
- Last checked
- Restart app button if `restartable=true`

**Refresh cadence:**
- Fetch app status when System tab opens.
- Refresh every 30s only while System tab is visible.
- Avoid every-5s app checks; that is unnecessary noise.

**Verification:**
- Taka FinTrack card shows UP if `https://takahashiumaru.my.id/` and/or `127.0.0.1:3001` responds.
- Project Work UAPS card shows UP if `https://apsone.web.id/` responds and PHP-FPM is active.
- Do not show `taka-school.service` in this panel.
- Down state is visible but not visually chaotic.

---

## Task 7: Add restart/reboot confirmation UI

**Objective:** Prevent accidental destructive actions on mobile.

**Files:**
- Modify: `/home/ubuntu/hermes-monitor/public/index.html`
- Modify: `/home/ubuntu/hermes-monitor/public/app.js`
- Modify: `/home/ubuntu/hermes-monitor/public/styles.css`

**App restart flow:**
- Tap “Restart App”.
- Confirmation drawer/modal says which app will restart.
- User taps confirm once more.
- Endpoint called.
- UI shows “Restarting…” then refreshes app health after 5s.

**VPS restart flow:**
- Tap “Restart VPS”.
- Confirmation asks user to type `RESTART SERVER`.
- Button disabled until exact match.
- Endpoint called only after exact match.

**Verification:**
- Wrong text keeps button disabled or returns 400.
- Close/cancel works.
- No accidental request fires on first tap.

---

## Task 8: Security and rate limiting

**Objective:** Ensure control endpoints are not abusable.

**Files:**
- Modify: `/home/ubuntu/hermes-monitor/server.js`

**Rules:**
- All endpoints require current auth cookie.
- Add a stricter rate limiter for control actions:
  - max 3 app restarts / 10 minutes
  - max 1 server reboot attempt / 10 minutes
- Return human-readable errors.
- Do not log secrets or request cookies.

**Verification:**
- Unauthenticated restart returns 401.
- Repeated wrong requests hit 429.

---

## Task 9: End-to-end verification without reboot

**Objective:** Prove everything works except real reboot, which needs explicit approval.

**Commands:**
- Syntax checks: `node -c server.js public/app.js lib/apps.js lib/history.js lib/system-actions.js`
- Restart: `systemctl --user restart server-monitoring.service`
- Status: `systemctl --user status server-monitoring.service --no-pager`
- API probes:
  - `/api/me`
  - `/api/apps`
  - `/api/history?range=1d`
  - unauthenticated `/api/apps` must be 401
  - wrong reboot confirm must be 400 or 401 depending auth
- Resource check:
  - Memory should stay well under 120M
  - CPU should stay low after startup

**Do not run:**
- Real VPS reboot endpoint.
- Real app restart endpoint, unless Umar approves testing it on one app.

---

## Task 10: Post-implementation cleanup

**Objective:** Keep the app maintainable and lightweight.

**Files:**
- Update: `/home/ubuntu/hermes-monitor/DESIGN.md`
- Optional: `/home/ubuntu/hermes-monitor/docs/APP_REGISTRY.md`

**Checklist:**
- Document monitored app IDs and services.
- Document sampling interval and retention.
- Document how to add a new app check.
- Bump frontend assets to a new version query param.
- Report changed files and verification results.

---

## Confirmed app mapping

Umar confirmed the two production projects to monitor are:

1. **Project Work UAPS / APS One** — `https://apsone.web.id/`, Nginx root `/home/ubuntu/project-work-uaps/public`, PHP-FPM `php8.3-fpm.service`.
2. **Taka FinTrack** — `https://takahashiumaru.my.id/`, Nginx proxy to `127.0.0.1:3001`, service `taka-fintrack.service`.

`taka-school.service` is unrelated to this feature and must not appear in the production app health cards.
