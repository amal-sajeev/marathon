"""Report the black margin on each face asset.

The portraits are drawn on black, so a margin here means dead space that the
circular avatar frame renders as a border rather than art.
"""

import sys
from pathlib import Path

from PIL import Image

FACES = Path("public/assets/faces")
# Anything this dark is background, not art. The portraits' own shadows sit
# well above it.
THRESHOLD = 20


def bounds(path: Path) -> tuple[int, int, int, int, int, int, str]:
    im = Image.open(path)
    w, h = im.size
    # Some of the art is cut out on transparency and some is drawn on black.
    # Judging an alpha image by its luma reads the undefined RGB behind the
    # transparent edge as content, which is how this tool lied the first time.
    if "A" in im.mode:
        source, kind = im.getchannel("A"), "alpha"
    else:
        source, kind = im.convert("L"), "black"
    box = source.point(lambda v: 255 if v > THRESHOLD else 0).getbbox()
    if box is None:
        raise SystemExit(f"{path.name} is entirely empty")
    return (*box, w, h, kind)


def main() -> int:
    rows = []
    for path in sorted(FACES.glob("*.webp")):
        left, top, right, bottom, w, h, kind = bounds(path)
        rows.append(
            (
                path.name,
                left,
                top,
                w - right,
                h - bottom,
                right - left,
                bottom - top,
                kind,
            )
        )

    print(f"{'file':<18}{'bg':<7}{'L':>5}{'T':>5}{'R':>5}{'B':>5}   content")
    for name, l, t, r, b, cw, ch, kind in rows:
        flag = "  <-- margin" if max(l, t, r, b) > 6 else ""
        print(f"{name:<18}{kind:<7}{l:>5}{t:>5}{r:>5}{b:>5}   {cw}x{ch}{flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
