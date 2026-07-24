// Rasterize notification assets Android can render (SVG icons/badges are
// ignored by Android's notification shade). Produces:
//   public/icons/notify-192.png  - full-color app icon for the notification
//   public/icons/badge-72.png    - white silhouette for the status-bar badge
// Run with: node scripts/gen-notify-icons.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(here, "..", "public", "icons");

// Badge: Android masks by alpha and tints white, so a plain transparent hexagon.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="none" stroke="#ffffff" stroke-width="34" stroke-linejoin="round">
    <path d="M256 72 L420 168 V344 L256 440 L92 344 V168 Z"/>
    <path d="M256 168 V344"/>
  </g>
</svg>`;

async function main() {
  const iconSvg = await readFile(resolve(iconsDir, "icon.svg"));

  await sharp(iconSvg, { density: 384 })
    .resize(192, 192, { fit: "cover" })
    .png()
    .toFile(resolve(iconsDir, "notify-192.png"));

  await sharp(Buffer.from(badgeSvg), { density: 384 })
    .resize(72, 72, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(resolve(iconsDir, "badge-72.png"));

  console.log("Wrote notify-192.png and badge-72.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
