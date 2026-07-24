/**
 * Registry of image asset "slots" the app expects.
 *
 * These are the assets you (the human) will provide. Until a file exists at the
 * given path under /public, a labeled placeholder is shown instead, so nothing
 * looks broken. To supply real art, drop a file at the listed path in `public/`
 * (keep the same name) and rebuild - no code change needed.
 */
export interface AssetSlot {
  key: string;
  label: string;
  glyph: string;
  /** path relative to the site root (served from /public) */
  src: string;
  note: string;
}

const base = import.meta.env.BASE_URL;

export const ASSET_SLOTS: Record<string, AssetSlot> = {
  agentPortrait: {
    key: "agentPortrait",
    label: "AGENT PORTRAIT",
    glyph: "\u25C9",
    src: `${base}assets/agent-portrait.png`,
    note: "Large portrait of the companion (shown in chat). ~512x512.",
  },
  agentAvatar: {
    key: "agentAvatar",
    label: "AGENT",
    glyph: "\u25C9",
    src: `${base}assets/agent-avatar.png`,
    note: "Small round avatar for the floating button. ~256x256.",
  },
  agentIcon: {
    key: "agentIcon",
    label: "LEELA",
    glyph: "\u25C9",
    src: `${base}assets/faces/neutral-1.webp`,
    note: "Leela's identity face (orb + intro). Reuses the neutral art.",
  },
  hero: {
    key: "hero",
    label: "HERO",
    glyph: "\u2694",
    src: `${base}assets/hero.png`,
    note: "The adventurer's portrait / sprite. ~256x256.",
  },
};
