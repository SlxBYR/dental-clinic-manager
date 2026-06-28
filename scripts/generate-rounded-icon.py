from pathlib import Path
import struct
import subprocess

from PIL import Image


BUILD = Path("build")
SOURCE = BUILD / "icon-preview.png"
ICONSET = BUILD / "icon.iconset"
ICO_PNGS = BUILD / "ico-pngs"


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)


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
    for name, px in sizes:
        run(["sips", "-z", str(px), str(px), str(BUILD / "icon.png"), "--out", str(ICONSET / name)])
    run(["iconutil", "-c", "icns", str(ICONSET), "-o", str(BUILD / "icon.icns")])


def make_ico() -> None:
    sizes = [16, 32, 48, 64, 128, 256]
    images: list[tuple[int, bytes]] = []
    for px in sizes:
        out = ICO_PNGS / f"{px}.png"
        run(["sips", "-z", str(px), str(px), str(BUILD / "icon.png"), "--out", str(out)])
        images.append((px, out.read_bytes()))

    header = struct.pack("<HHH", 0, 1, len(images))
    entries = []
    offset = 6 + len(images) * 16
    for px, data in images:
        entries.append(struct.pack("<BBBBHHII", 0 if px == 256 else px, 0 if px == 256 else px, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    (BUILD / "icon.ico").write_bytes(header + b"".join(entries) + b"".join(data for _, data in images))


if __name__ == "__main__":
    make_icon()
    make_icns()
    make_ico()
