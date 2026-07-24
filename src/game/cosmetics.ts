export type CosmeticSlot = "accent" | "orbSkin" | "badgeFrame";

export interface Cosmetic {
  id: string;
  slot: CosmeticSlot;
  label: string;
  /** gold price; 0 means owned by default */
  cost: number;
  /** slot-specific value: a hex color for accent, a class suffix otherwise */
  value: string;
}

/** The app's stock look, always available and free. */
export const DEFAULT_ACCENT = "#38e6ff";

export const COSMETICS: Cosmetic[] = [
  // Accent colors recolor the app's neon (--accent).
  { id: "accent-cyan", slot: "accent", label: "Signal Cyan", cost: 0, value: DEFAULT_ACCENT },
  { id: "accent-ember", slot: "accent", label: "Ember", cost: 140, value: "#ff9d3c" },
  { id: "accent-amethyst", slot: "accent", label: "Amethyst", cost: 140, value: "#b98cff" },
  { id: "accent-verdant", slot: "accent", label: "Verdant", cost: 140, value: "#48e6a0" },
  { id: "accent-rose", slot: "accent", label: "Rose", cost: 200, value: "#ff6ea0" },
  { id: "accent-gold", slot: "accent", label: "Solar Gold", cost: 260, value: "#ffc65a" },

  // Orb skins restyle the companion FAB (class agent-fab--<value>).
  { id: "orb-default", slot: "orbSkin", label: "Standard Orb", cost: 0, value: "" },
  { id: "orb-halo", slot: "orbSkin", label: "Halo", cost: 180, value: "halo" },
  { id: "orb-pulse", slot: "orbSkin", label: "Pulse Ring", cost: 240, value: "pulse" },

  // Badge frames wrap the rank insignia (class badge-frame--<value>).
  { id: "frame-default", slot: "badgeFrame", label: "Standard Frame", cost: 0, value: "" },
  { id: "frame-ring", slot: "badgeFrame", label: "Orbit Ring", cost: 160, value: "ring" },
  { id: "frame-spokes", slot: "badgeFrame", label: "Spokes", cost: 220, value: "spokes" },
];

export function cosmeticById(id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.id === id);
}

/** The default cosmetic id for a slot (free, always owned). */
export function defaultCosmetic(slot: CosmeticSlot): Cosmetic {
  return COSMETICS.find((c) => c.slot === slot && c.cost === 0)!;
}

export type ConsumableKind = "hpPotion" | "xpCharm" | "streakShield";

export interface ConsumableInfo {
  label: string;
  cost: number;
  note: string;
  glyph: string;
}

export const CONSUMABLES: Record<ConsumableKind, ConsumableInfo> = {
  hpPotion: {
    label: "HP Potion",
    cost: 25,
    note: "Restore 40% of your max HP.",
    glyph: "\u2665",
  },
  xpCharm: {
    label: "XP Charm",
    cost: 40,
    note: "1.5x XP for the rest of today.",
    glyph: "\u2726",
  },
  streakShield: {
    label: "Streak Shield",
    cost: 60,
    note: "Protects your day-streak if you miss a day.",
    glyph: "\u2748",
  },
};
