// Rasterize Leela's neutral face into home-screen icons. The manifest and iOS
// both want PNGs, and the source art is a transparent cut-out, so every variant
// gets the app background composited behind it. Produces:
//   public/icons/leela-192.png          - standard install icon
//   public/icons/leela-512.png          - large install icon / splash source
//   public/icons/leela-maskable-512.png - Android adaptive icon, inset to the safe zone
//   public/icons/apple-touch-icon.png   - iOS home screen (180x180, no alpha)
// Run with: npm run app-icons
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, "..", "public");
const iconsDir = resolve(pub, "icons");
const source = resolve(pub, "assets", "faces", "neutral-1.webp");

/** Matches theme_color / background_color so the cut-out sits on app black. */
const BG = { r: 0, g: 2, b: 6, alpha: 1 };

/** Android masks maskable icons to a circle 80% of the width. */
const SAFE = 0.8;

/**
 * These land in the install-time precache, so they get palette-quantized. Flat
 * cel-shaded art survives 256 colours without visible banding and it costs
 * roughly a megabyte across the four files.
 */
const PNG = { compressionLevel: 9, palette: true, quality: 90, effort: 10 };

async function main() {
  for (const size of [192, 512]) {
    await sharp(source)
      .resize(size, size, { fit: "cover" })
      .flatten({ background: BG })
      .png(PNG)
      .toFile(resolve(iconsDir, `leela-${size}.png`));
  }

  const inner = Math.round(512 * SAFE);
  const pad = Math.round((512 - inner) / 2);
  await sharp(source)
    .resize(inner, inner, { fit: "cover" })
    .flatten({ background: BG })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: BG })
    .png(PNG)
    .toFile(resolve(iconsDir, "leela-maskable-512.png"));

  await sharp(source)
    .resize(180, 180, { fit: "cover" })
    .flatten({ background: BG })
    .png(PNG)
    .toFile(resolve(iconsDir, "apple-touch-icon.png"));

  console.log(
    "Wrote leela-192.png, leela-512.png, leela-maskable-512.png, apple-touch-icon.png",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
