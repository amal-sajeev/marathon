// Compress every PNG in public/assets/faces to WebP (and delete the PNG), so
// Leela's face/background art stays small. Requires ffmpeg on your PATH.
// Usage: npm run faces
import { readdirSync, statSync, rmSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { spawnSync } from "node:child_process";

const dir = join(process.cwd(), "public", "assets", "faces");

let pngs;
try {
  pngs = readdirSync(dir).filter((f) => extname(f).toLowerCase() === ".png");
} catch {
  console.error(`No faces folder at ${dir}`);
  process.exit(1);
}

if (pngs.length === 0) {
  console.log("No PNGs to convert - everything is already WebP.");
  process.exit(0);
}

for (const file of pngs) {
  const input = join(dir, file);
  const output = join(dir, `${basename(file, ".png")}.webp`);
  // The square identity icon can take a touch more quality; larger scene art a
  // touch less. "icon" in the name is the only special case.
  const quality = file.toLowerCase().includes("icon") ? "88" : "80";

  const res = spawnSync(
    "ffmpeg",
    ["-y", "-i", input, "-c:v", "libwebp", "-quality", quality, "-compression_level", "6", output],
    { stdio: "ignore" },
  );

  if (res.status !== 0) {
    console.error(`Failed to convert ${file} (is ffmpeg installed?).`);
    continue;
  }

  const before = statSync(input).size;
  const after = statSync(output).size;
  rmSync(input);
  console.log(
    `${file} -> ${basename(output)}  ${(before / 1024).toFixed(0)}KB -> ${(
      after / 1024
    ).toFixed(0)}KB`,
  );
}
