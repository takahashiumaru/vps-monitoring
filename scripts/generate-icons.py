from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICONS = PUBLIC / "icons"
ICONS.mkdir(parents=True, exist_ok=True)

# Simple monochrome Server Monitoring mark: rounded app tile + vertical server rack + signal ticks.
# Works in dark and light mode without depending on gradients or text.
SIZES = [16, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512, 1024]


def rounded_rect(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_logo(size: int, bg: str, fg: str, border: str | None = None) -> Image.Image:
    scale = size / 1024
    img = Image.new("RGBA", (size, size), bg)
    d = ImageDraw.Draw(img)

    # App tile border for PNG masks.
    pad = int(70 * scale)
    if border:
        rounded_rect(d, (pad, pad, size - pad, size - pad), int(228 * scale), bg, border, max(2, int(18 * scale)))

    # Central server body.
    x1, y1 = int(300 * scale), int(206 * scale)
    x2, y2 = int(724 * scale), int(818 * scale)
    rounded_rect(d, (x1, y1, x2, y2), int(88 * scale), fg)

    # Cut-out rack slots.
    slot_color = bg
    slot_h = max(10, int(42 * scale))
    slot_r = max(5, int(21 * scale))
    for y in [int(334 * scale), int(491 * scale), int(648 * scale)]:
        rounded_rect(d, (int(390 * scale), y, int(632 * scale), y + slot_h), slot_r, slot_color)

    # Status dots.
    for cy in [int(355 * scale), int(512 * scale), int(669 * scale)]:
        r = max(5, int(22 * scale))
        d.ellipse((int(338 * scale) - r, cy - r, int(338 * scale) + r, cy + r), fill=slot_color)

    # Minimal signal ticks on top right.
    tick_w = max(4, int(36 * scale))
    for i, h in enumerate([96, 150, 210]):
        tx = int((780 + i * 70) * scale)
        ty2 = int(372 * scale)
        rounded_rect(d, (tx, ty2 - int(h * scale), tx + tick_w, ty2), int(18 * scale), fg)

    # Ground line.
    rounded_rect(d, (int(244 * scale), int(854 * scale), int(780 * scale), int(896 * scale)), int(21 * scale), fg)
    return img


def logo_svg(bg: str, fg: str) -> str:
    return f'''<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="228" fill="{bg}"/>
  <path fill="{fg}" d="M300 294c0-49 40-88 88-88h248c49 0 88 40 88 88v436c0 49-40 88-88 88H388c-49 0-88-40-88-88V294Z"/>
  <path fill="{bg}" d="M390 334h242v42H390zM390 491h242v42H390zM390 648h242v42H390z"/>
  <circle cx="338" cy="355" r="22" fill="{bg}"/><circle cx="338" cy="512" r="22" fill="{bg}"/><circle cx="338" cy="669" r="22" fill="{bg}"/>
  <path fill="{fg}" d="M780 276h36v96h-36zM850 222h36v150h-36zM920 162h36v210h-36zM244 854h536v42H244z"/>
</svg>'''

(PUBLIC / "logo-light.svg").write_text(logo_svg("#F7FAFC", "#0B1220"))
(PUBLIC / "logo-dark.svg").write_text(logo_svg("#0B1220", "#F7FAFC"))

# PNG variants.
for size in SIZES:
    draw_logo(size, "#F7FAFC", "#0B1220", "#DCE7F2").save(ICONS / f"icon-{size}.png")
    draw_logo(size, "#0B1220", "#F7FAFC", "#223044").save(ICONS / f"icon-{size}-dark.png")

# Apple touch icon should not be transparent.
draw_logo(180, "#F7FAFC", "#0B1220", "#DCE7F2").save(PUBLIC / "apple-touch-icon.png")
# Favicon ICO with multiple sizes.
imgs = [draw_logo(s, "#F7FAFC", "#0B1220", "#DCE7F2") for s in (16, 32, 48)]
imgs[0].save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

print(f"Generated {len(SIZES) * 2 + 4} logo/icon assets in {PUBLIC}")
