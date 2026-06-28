from pathlib import Path
from PIL import Image


BUILD = Path("build")
SOURCE = BUILD / "icon-preview.png"
ICONSET = BUILD / "icon.iconset"
ICO_PNGS = BUILD / "ico-pngs"


def make_icon() -> None:
    BUILD.mkdir(exist_ok=True)
    ICONSET.mkdir(parents=True, exist_ok=True)
    ICO_PNGS.mkdir(parents=True, exist_ok=True)

    source = Image.open(SOURCE).convert("RGBA")
    canvas_size = 1024
    icon = source.resize((canvas_size, canvas_size), Image.Resampling.LANCZOS)
    icon.save(BUILD / "icon.png")


def make_icns() -> None:
    sizes = [
        ("icon_16x16.png", 16),
        ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32),
        ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128),
        ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256),
        ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512),
        ("icon_512x512@2x.png", 1024),
    ]
    icon = Image.open(BUILD / "icon.png").convert("RGBA")
    for name, px in sizes:
        icon.resize((px, px), Image.Resampling.LANCZOS).save(ICONSET / name)
    icon.save(
        BUILD / "icon.icns",
        format="ICNS",
        sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)],
    )


def make_ico() -> None:
    sizes = [16, 32, 48, 64, 128, 256]
    icon = Image.open(BUILD / "icon.png").convert("RGBA")
    for px in sizes:
        out = ICO_PNGS / f"{px}.png"
        icon.resize((px, px), Image.Resampling.LANCZOS).save(out)
    icon.save(BUILD / "icon.ico", format="ICO", sizes=[(px, px) for px in sizes])


if __name__ == "__main__":
    make_icon()
    make_icns()
    make_ico()
