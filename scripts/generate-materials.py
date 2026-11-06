from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
WIDTH, HEIGHT = 1800, 1200
Y, X = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
X /= WIDTH
Y /= HEIGHT

PALETTES = {
    "lagoon": ["071e68", "084ac3", "118bd9", "7fd6e9", "eef9fb"],
    "aurora": ["043f40", "08766c", "35a68a", "a9d6bb", "eef2dc"],
    "ember": ["411d20", "9d3e28", "df7045", "edb17d", "f5e6cb"],
    "mono": ["151f2a", "425467", "839aaa", "c7d6db", "f2f5f3"],
}


def material(name, colours):
    """
    Draw original contour artwork whose fine lines make refraction visible
    """
    offset = list(PALETTES).index(name) * 0.22
    curve = Y - 0.22 * np.sin(X * 4.8 + offset) - 0.36 * X
    field = np.clip(0.17 + curve * 1.08 + 0.16 * np.cos(X * 3.2 - Y * 2), 0, 1)
    stops = np.linspace(0, 1, len(colours))
    palette = np.array([[int(c[i:i + 2], 16) for i in (0, 2, 4)] for c in colours])
    pixels = np.stack([np.interp(field, stops, palette[:, channel]) for channel in range(3)], axis=-1)
    ridges = np.sin((curve + 0.024 * np.sin(X * 12 + Y * 4)) * 92)
    fine = np.power(np.clip(ridges, 0, 1), 30) * 0.11
    pixels = pixels * (1 - fine[..., None]) + 250 * fine[..., None]
    broad = np.sin(curve * 18 + X * 0.9)
    shade = 0.94 + 0.06 * broad
    pixels *= shade[..., None]
    rng = np.random.default_rng(2904)
    pixels += rng.normal(0, 0.65, (HEIGHT, WIDTH, 1))
    Image.fromarray(np.uint8(np.clip(pixels, 0, 255))).save(ROOT / "assets" / f"material-{name}.png", optimize=True)


for material_name, material_colours in PALETTES.items():
    material(material_name, material_colours)

logo = Image.open(ROOT / "assets" / "brand" / "liquid-glass.png")
logo.thumbnail((384, 384), Image.Resampling.LANCZOS)
logo.save(ROOT / "assets" / "brand" / "liquid-glass.png", optimize=True)
logo.thumbnail((64, 64), Image.Resampling.LANCZOS)
logo.save(ROOT / "assets" / "brand" / "favicon.png", optimize=True)
