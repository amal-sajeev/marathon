"""Cut Leela's portraits out of a labelled contact sheet, full bleed.

The sheets lay the portraits out in a grid with a caption under each one, and
each cell carries uneven black gutters. A naive cell crop is wider than it is
tall once the caption is excluded, so padding it out to a square leaves black
bars that the circular avatar frame renders as a border.

Instead we find the art's real bounding box and take the largest square that
fits inside it, so the output is entirely art. When the box is wider than it
is tall we keep the full height and trim the sides; when it is taller we keep
the full width and trim from the bottom, since the head sits at the top and
the shoulders are the expendable part.
"""

import sys
from pathlib import Path

from PIL import Image

OUT = Path("public/assets/faces")
SIZE = 700
QUALITY = 82
THRESHOLD = 20

# Cell regions exclude the caption band at each row's foot, so the gold caption
# text is never mistaken for art. Verified against each sheet before use.
SHEETS = [
    (
        "ChatGPT_Image_Jul_25__2026__01_08_24_PM-1397062a-e9c3-4bdf-b32a-873413ba9bd1.png",
        [
            ("surprised-3", 0, 0, 341, 322),
            ("angry-1", 341, 0, 342, 322),
            ("sad-2", 683, 0, 341, 322),
            ("shy-1", 0, 356, 341, 286),
            ("thinking-3", 341, 356, 342, 286),
            ("confident-1", 683, 356, 341, 286),
        ],
    ),
    (
        "ChatGPT_Image_Jul_25__2026__01_04_52_PM-6b8d2ff0-8d76-4cd8-8eb6-8dcc95ab5c91.png",
        [
            ("excited-2", 0, 0, 341, 313),
            ("determined-1", 341, 0, 342, 313),
            ("worried-1", 683, 0, 341, 313),
            ("shocked-1", 0, 355, 341, 291),
            ("laughing-1", 341, 355, 342, 291),
            ("serious-1", 683, 355, 341, 291),
        ],
    ),
]

SHEET_DIR = Path(
    r"C:\Users\Enterprise\.cursor\projects"
    r"\c-Users-Enterprise-Documents-RPGtask\assets"
)
SHEET_PREFIX = (
    "c__Users_Enterprise_AppData_Roaming_Cursor_User_workspaceStorage"
    "_7140a73d1aa4caf77b0086f3912d3428_images_"
)


def content_box(im: Image.Image) -> tuple[int, int, int, int]:
    """Bounding box of the actual art.

    Some of the art is cut out on transparency and some is drawn on black, so
    the test has to follow the image. Judging an alpha image by its luma reads
    the undefined RGB behind the transparent edge as content and defeats the
    whole exercise.
    """
    source = im.getchannel("A") if "A" in im.mode else im.convert("L")
    box = source.point(lambda v: 255 if v > THRESHOLD else 0).getbbox()
    if box is None:
        raise SystemExit("image is entirely empty")
    return box


def square_on_art(im: Image.Image) -> Image.Image:
    left, top, right, bottom = content_box(im)
    width, height = right - left, bottom - top
    side = min(width, height)

    if width >= height:
        x = left + (width - side) // 2
        y = top
    else:
        x = left
        y = top  # anchor to the head, trim the shoulders

    return im.crop((x, y, x + side, y + side))


def save(im: Image.Image, path: Path) -> None:
    im.resize((SIZE, SIZE), Image.LANCZOS).save(path, quality=QUALITY, method=6)


def cut_sheets() -> None:
    for filename, cells in SHEETS:
        sheet = Image.open(SHEET_DIR / (SHEET_PREFIX + filename)).convert("RGB")
        print(f"{filename[:28]}:")
        for name, x, y, w, h in cells:
            art = square_on_art(sheet.crop((x, y, x + w, y + h)))
            save(art, OUT / f"{name}.webp")
            print(f"  {name}.webp  from {art.width}px square")


def tighten_installed() -> None:
    """Re-cut any already-installed portrait that still has a margin.

    Covers the hand-made assets that never came off a sheet. Those are cut out
    on transparency, so the mode is carried through untouched rather than
    flattened: dropping their alpha exposes undefined pixels behind the cutout
    and speckles the whole background. A no-op once an asset is full bleed, so
    this is safe to re-run without stacking up generations of re-encoding.
    """
    for path in sorted(OUT.glob("*.webp")):
        im = Image.open(path)
        left, top, right, bottom = content_box(im)
        margin = max(left, top, im.width - right, im.height - bottom)
        if margin <= 6:
            continue
        save(square_on_art(im), path)
        print(f"  {path.name}  tightened {margin}px, kept {im.mode}")


def main() -> int:
    cut_sheets()
    print("installed:")
    tighten_installed()
    return 0


if __name__ == "__main__":
    sys.exit(main())
