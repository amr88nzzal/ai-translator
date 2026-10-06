"""
Generates the PWA icon set (PNG) from the same visual language as icon.svg.

Run with the bundled Python:  python scripts/generate-icons.py
Outputs into client/public/icons/.
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "client", "public", "icons")
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"

INDIGO_LIGHT = (99, 102, 241)
INDIGO_MID = (79, 70, 229)
INDIGO_DARK = (49, 46, 129)

SUPERSAMPLE = 4


def vertical_gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    """Diagonal-ish gradient built from a vertical ramp (cheap and smooth)."""
    image = Image.new("RGB", (size, size), top)
    draw = ImageDraw.Draw(image)
    for y in range(size):
        ratio = y / max(1, size - 1)
        eased = ratio**0.85
        color = tuple(round(top[i] + (bottom[i] - top[i]) * eased) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color)
    return image


def three_stop_gradient(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(image)
    for y in range(size):
        ratio = y / max(1, size - 1)
        if ratio < 0.55:
            local = ratio / 0.55
            color = tuple(round(INDIGO_LIGHT[i] + (INDIGO_MID[i] - INDIGO_LIGHT[i]) * local) for i in range(3))
        else:
            local = (ratio - 0.55) / 0.45
            color = tuple(round(INDIGO_MID[i] + (INDIGO_DARK[i] - INDIGO_MID[i]) * local) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color)
    return image


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def draw_globe(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, stroke: int, color) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=stroke)
    # Meridian ellipse: approximate with a scaled circle.
    draw.ellipse([cx - r * 0.46, cy - r, cx + r * 0.46, cy + r], outline=color, width=stroke)
    # Latitude lines clipped to the circle.
    for offset in (-0.34, 0.34):
        y = cy + r * offset
        half = math.sqrt(max(0.0, r * r - (y - cy) ** 2))
        draw.line([(cx - half, y), (cx + half, y)], fill=color, width=stroke)


def draw_wave(draw: ImageDraw.ImageDraw, cx: float, cy: float, scale: float, color) -> None:
    """Four symmetric equaliser bars flanking the globe."""
    heights = [0.30, 0.62, 0.62, 0.30]
    offsets = [-1.30, -1.02, 1.02, 1.30]
    width = 0.16 * scale
    for height, offset in zip(heights, offsets):
        x = cx + offset * scale
        half = height * scale
        draw.rounded_rectangle(
            [x - width / 2, cy - half, x + width / 2, cy + half],
            radius=width / 2,
            fill=color,
        )


def draw_letter(draw: ImageDraw.ImageDraw, cx: float, cy: float, scale: float, color) -> None:
    """
    Stylised 'ت' (the taa of ترجمة): a shallow bowl with two dots above it,
    drawn with primitives so the mark stays crisp at 192px.
    """
    stroke = 0.085 * scale
    width = 0.86 * scale
    left = cx - width / 2
    right = cx + width / 2
    top = cy - 0.10 * scale
    bottom = cy + 0.26 * scale

    draw.arc([left, top - 0.18 * scale, right, bottom + 0.18 * scale], start=15, end=165, fill=color, width=round(stroke))
    draw.line([(left + stroke * 0.4, cy + 0.04 * scale), (right - stroke * 0.4, cy + 0.04 * scale)], fill=color, width=round(stroke))

    # Two dots above the letter.
    for dx in (-0.16, 0.16):
        r = stroke * 0.42
        x = cx + dx * scale
        y = cy - 0.52 * scale
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def build_icon(size: int, maskable: bool) -> Image.Image:
    canvas_size = size * SUPERSAMPLE
    base = three_stop_gradient(canvas_size).convert("RGBA")

    # Soft top glow for depth.
    glow = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        [-canvas_size * 0.35, -canvas_size * 0.55, canvas_size * 1.35, canvas_size * 0.45],
        fill=(255, 255, 255, 46),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(canvas_size * 0.06))
    base = Image.alpha_composite(base, glow)

    draw = ImageDraw.Draw(base)
    stroke = max(1, round(canvas_size * 0.028))

    # Safe zone: maskable icons must keep content inside the central 80%.
    content_scale = 0.62 if maskable else 0.78
    globe_r = canvas_size * 0.19
    center_y = canvas_size * (0.42 if maskable else 0.38)

    draw_globe(draw, canvas_size / 2, center_y, globe_r, stroke, (224, 231, 255, 255))
    draw_wave(draw, canvas_size / 2, center_y, globe_r * 1.62, (199, 210, 254, 235))

    # The letter sits below the globe with a deliberate gap so it reads as a
    # separate glyph (globe = languages, taa = "ترجمة", bars = live voice).
    letter_cy = center_y + globe_r * 1.52
    letter_scale = (0.28 if maskable else 0.32) * canvas_size * (content_scale / 0.78)
    draw_letter(draw, canvas_size / 2, letter_cy, letter_scale, (255, 255, 255, 255))

    icon = base.resize((size, size), Image.LANCZOS)

    if not maskable:
        mask = rounded_mask(size, radius=round(size * 0.22))
        rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        rounded.paste(icon, (0, 0), mask)
        return rounded

    return icon


def build_screenshot(width: int, height: int, label: str) -> Image.Image:
    image = three_stop_gradient(max(width, height)).resize((width, height), Image.LANCZOS).convert("RGBA")
    overlay = Image.new("RGBA", (width, height), (7, 11, 22, 92))
    image = Image.alpha_composite(image, overlay)
    draw = ImageDraw.Draw(image)

    panel = [
        width * 0.06,
        height * 0.10,
        width * 0.94,
        height * 0.90,
    ]
    draw.rounded_rectangle(panel, radius=round(min(width, height) * 0.05), fill=(15, 23, 42, 205), outline=(148, 163, 184, 70), width=2)

    title_font = ImageFont.truetype(FONT_BOLD, max(16, round(min(width, height) * 0.055)))
    body_font = ImageFont.truetype(FONT_BOLD, max(12, round(min(width, height) * 0.032)))

    draw.text((panel[0] + width * 0.05, panel[1] + height * 0.06), "المترجم الصوتي والسياقي الذكي", font=title_font, fill=(255, 255, 255, 255))
    draw.text(
        (panel[0] + width * 0.05, panel[1] + height * 0.16),
        label,
        font=body_font,
        fill=(199, 210, 254, 255),
    )

    # Fake transcript / translation blocks.
    block_top = panel[1] + height * 0.26
    for index in range(3):
        top = block_top + index * height * 0.17
        draw.rounded_rectangle(
            [panel[0] + width * 0.05, top, panel[2] - width * 0.05, top + height * 0.12],
            radius=round(min(width, height) * 0.03),
            fill=(30, 41, 59, 190),
        )
        for line in range(2):
            line_width = (0.66, 0.44)[line] * (panel[2] - panel[0] - width * 0.14)
            draw.rounded_rectangle(
                [
                    panel[0] + width * 0.08,
                    top + height * 0.028 + line * height * 0.043,
                    panel[0] + width * 0.08 + line_width,
                    top + height * 0.04 + line * height * 0.043,
                ],
                radius=4,
                fill=(148, 163, 184, 150),
            )

    # Microphone affordance.
    cx, cy = width / 2, panel[3] - height * 0.12
    radius = min(width, height) * 0.075
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(99, 102, 241, 255))
    draw.rounded_rectangle(
        [cx - radius * 0.22, cy - radius * 0.5, cx + radius * 0.22, cy + radius * 0.1],
        radius=radius * 0.22,
        fill=(255, 255, 255, 255),
    )
    draw.arc(
        [cx - radius * 0.5, cy - radius * 0.35, cx + radius * 0.5, cy + radius * 0.5],
        start=0,
        end=180,
        fill=(255, 255, 255, 255),
        width=max(2, round(radius * 0.14)),
    )
    draw.line(
        [(cx, cy + radius * 0.5), (cx, cy + radius * 0.72)],
        fill=(255, 255, 255, 255),
        width=max(2, round(radius * 0.14)),
    )

    return image.convert("RGB")


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    outputs: list[tuple[str, Image.Image, str]] = [
        ("icon-512.png", build_icon(512, maskable=False), "PNG"),
        ("icon-192.png", build_icon(192, maskable=False), "PNG"),
        ("maskable-512.png", build_icon(512, maskable=True), "PNG"),
        ("maskable-192.png", build_icon(192, maskable=True), "PNG"),
        ("apple-touch-icon.png", build_icon(180, maskable=True), "PNG"),
        ("favicon-32.png", build_icon(32, maskable=False), "PNG"),
        ("screenshot-wide.png", build_screenshot(1280, 720, "ترجمة صوتية فورية مع تحليل سياقي"), "PNG"),
        ("screenshot-mobile.png", build_screenshot(720, 1280, "واجهة الجوال — نمط البث المباشر"), "PNG"),
    ]

    for name, image, fmt in outputs:
        path = os.path.join(OUT_DIR, name)
        image.save(path, fmt)
        print(f"[ok] {name}  {image.size[0]}x{image.size[1]}  {os.path.getsize(path) // 1024} kB")

    print(f"generated {len(outputs)} files in {OUT_DIR}")


if __name__ == "__main__":
    main()
