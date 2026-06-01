from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"
ICONS.mkdir(parents=True, exist_ok=True)

SRC = Path.home() / ".hermes" / "image_cache" / "server-monitoring-gpt55-logo.png"
if not SRC.exists():
    raise SystemExit(f"missing source: {SRC}")

base = Image.open(SRC).convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
light = ImageOps.invert(base)

# UI logo files: dark theme uses dark tile, light theme uses inverted light tile.
base.save(PUBLIC / "logo-dark.png", optimize=True)
light.save(PUBLIC / "logo-light.png", optimize=True)

SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512, 1024]
for size in SIZES:
    base.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / f"icon-{size}.png", optimize=True)
    light.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / f"icon-{size}-light.png", optimize=True)

# iOS and favicon use the dark tile for strong contrast in home screen / browser tab.
base.resize((180, 180), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png", optimize=True)
imgs = [base.resize((s, s), Image.Resampling.LANCZOS) for s in (16, 32, 48)]
imgs[0].save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

print("Built icons from GPT-5.5 image source")
print(SRC)
