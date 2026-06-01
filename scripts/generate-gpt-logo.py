from __future__ import annotations

import base64
import json
import os
import sys
import time
from pathlib import Path
from urllib import request, error

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path.home() / ".hermes" / "image_cache"
CACHE.mkdir(parents=True, exist_ok=True)
OUT = CACHE / "server-monitoring-gpt55-logo.png"


def load_env(path: Path):
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env(Path.home() / ".hermes" / ".env")

base = os.environ.get("NINEROUTER_URL") or "http://127.0.0.1:20128"
key = os.environ.get("NINEROUTER_KEY") or os.environ.get("NINE_ROUTER_KEY") or ""

prompt = """
Create a premium iOS app icon for an app named Server Monitoring.
Style: minimal, professional, monochrome black and white only, no text, no letters, no numbers.
Visual concept: abstract server health monitor: a clean rounded square app icon containing a bold geometric server rack silhouette merged with a subtle heartbeat/uptime line and tiny status node.
Must feel modern like an Apple utility app icon, polished, balanced, memorable, not generic clipart.
Use a dark charcoal/black background with white/off-white symbol. Simple high-contrast shape, centered, suitable at 16px and 1024px.
No gradients except very subtle depth if needed. No colorful neon, no cyan, no purple, no 3D mascot, no words, no UI screenshot.
Square 1024x1024, crisp edges, app icon composition with safe margins.
""".strip()

payload = {
    "model": "cx/gpt-5.5-image",
    "prompt": prompt,
    "size": "1024x1024",
    "response_format": "b64_json",
}
body = json.dumps(payload).encode()
url = base.rstrip('/') + "/v1/images/generations"
headers = {"Content-Type": "application/json"}
if key:
    headers["Authorization"] = "Bearer " + key

req = request.Request(url, data=body, headers=headers, method="POST")
print("Generating with cx/gpt-5.5-image...", flush=True)
try:
    with request.urlopen(req, timeout=360) as resp:
        ctype = resp.headers.get("Content-Type", "")
        data = resp.read()
except error.HTTPError as e:
    sys.stderr.write(f"HTTP {e.code}: {e.read().decode(errors='ignore')[:1000]}\n")
    raise

if ctype.startswith("image/"):
    OUT.write_bytes(data)
else:
    parsed = json.loads(data.decode())
    item = parsed.get("data", [{}])[0]
    if item.get("b64_json"):
        OUT.write_bytes(base64.b64decode(item["b64_json"]))
    elif item.get("url"):
        with request.urlopen(item["url"], timeout=180) as img_resp:
            OUT.write_bytes(img_resp.read())
    else:
        raise RuntimeError("No image returned")

print(str(OUT), flush=True)
print(OUT.stat().st_size, flush=True)
