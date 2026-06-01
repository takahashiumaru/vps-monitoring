# Local / iPhone build usage

Recommended mode for Umar's iPhone/PWA build:

1. Keep `server-monitoring.service` running on the VPS.
2. Build the iPhone wrapper/PWA locally.
3. Point the wrapper WebView/start URL to the VPS dashboard URL or HTTPS domain.

This avoids putting SSH keys inside the mobile app and keeps system control on the VPS.

## SSH tunnel for local testing

If you only want to open the VPS dashboard through localhost while developing locally, use an SSH tunnel from the local computer:

```bash
ssh -i /path/to/key -N -L 3002:127.0.0.1:3002 ubuntu@43.133.155.252
```

Then open:

```text
http://127.0.0.1:3002/
```

## Running Server Monitoring on another server

Install the app there and configure env vars:

```env
HM_PORT=3002
HM_HOST=0.0.0.0
HM_ADMIN_USER=admin
HM_ADMIN_PASS=change-this
HM_SESSION_SECRET=change-this-long-random
HM_STATE_DB=/home/ubuntu/.hermes/state.db
HM_HISTORY_DB=/path/to/metrics-history.sqlite
```

If Hermes is not installed or `HM_STATE_DB` does not exist, the app automatically hides Hermes-only UI such as Chat/history panels and keeps VPS metrics, production app monitoring, history resource charts, and control menus visible.

## Do not embed SSH keys in the iPhone app

Putting a VPS SSH private key in a client/mobile build is unsafe. If remote control is needed from the app, use the authenticated dashboard API over HTTPS, or keep the dashboard backend on the VPS and let it execute allowlisted systemd actions locally.
