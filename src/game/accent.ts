import type { CSSProperties } from "react";

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().replace("#", "");
  if (m.length !== 6) return null;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return [r, g, b];
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

function mix(rgb: [number, number, number], target: number, amt: number): [number, number, number] {
  return [
    rgb[0] + (target - rgb[0]) * amt,
    rgb[1] + (target - rgb[1]) * amt,
    rgb[2] + (target - rgb[2]) * amt,
  ];
}

/**
 * Build the neon palette CSS variables from a single accent hex, so a cosmetic
 * accent recolors the whole UI. Returns undefined for the default/empty accent.
 */
export function accentStyle(accent: string): CSSProperties | undefined {
  const rgb = accent ? parseHex(accent) : null;
  if (!rgb) return undefined;
  const [r, g, b] = rgb;
  const soft = mix(rgb, 255, 0.4);
  const deep = mix(rgb, 0, 0.35);
  return {
    "--neon": toHex(r, g, b),
    "--neon-soft": toHex(soft[0], soft[1], soft[2]),
    "--neon-deep": toHex(deep[0], deep[1], deep[2]),
    "--neon-wire": `rgba(${r}, ${g}, ${b}, 0.35)`,
    "--neon-wire-soft": `rgba(${r}, ${g}, ${b}, 0.14)`,
    "--accent": toHex(r, g, b),
  } as CSSProperties;
}
