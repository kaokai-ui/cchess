from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "chessicon.png"
OUTPUT = ROOT / "client" / "public" / "icons"
MASKABLE_BG = (0, 0, 1, 255)


def save_resized(image: Image.Image, name: str, size: int) -> None:
    resized = image.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(OUTPUT / name)


def save_maskable(image: Image.Image, name: str, size: int) -> None:
    canvas = Image.new("RGBA", (size, size), MASKABLE_BG)
    inset = int(size * 0.82)
    icon = image.resize((inset, inset), Image.Resampling.LANCZOS)
    offset = (size - inset) // 2
    canvas.alpha_composite(icon, (offset, offset))
    canvas.save(OUTPUT / name)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")

    save_resized(source, "favicon-32x32.png", 32)
    save_resized(source, "favicon-192x192.png", 192)
    save_resized(source, "pwa-192x192.png", 192)
    save_resized(source, "pwa-512x512.png", 512)
    save_resized(source, "apple-touch-icon.png", 180)
    save_maskable(source, "maskable-192x192.png", 192)
    save_maskable(source, "maskable-512x512.png", 512)

    source.resize((64, 64), Image.Resampling.LANCZOS).save(
        ROOT / "client" / "public" / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )


if __name__ == "__main__":
    main()
