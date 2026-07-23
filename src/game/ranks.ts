export interface Rank {
  name: string;
  /** minimum character level to hold this rank */
  minLevel: number;
  /** neon accent color for the insignia */
  color: string;
  /** 1..8, drives how elaborate the badge renders */
  tier: number;
}

export const RANKS: Rank[] = [
  { name: "Recruit", minLevel: 1, tier: 1, color: "#38e6ff" },
  { name: "Operative", minLevel: 3, tier: 2, color: "#7ff1ff" },
  { name: "Sentinel", minLevel: 6, tier: 3, color: "#48e6a0" },
  { name: "Vanguard", minLevel: 10, tier: 4, color: "#5db4ff" },
  { name: "Warden", minLevel: 15, tier: 5, color: "#b98cff" },
  { name: "Centurion", minLevel: 21, tier: 6, color: "#ff9d3c" },
  { name: "Sovereign", minLevel: 28, tier: 7, color: "#ffc65a" },
  { name: "Ascendant", minLevel: 36, tier: 8, color: "#eafcff" },
];

/** The rank held at a given level (highest whose minLevel <= level). */
export function rankForLevel(level: number): Rank {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (level >= rank.minLevel) current = rank;
    else break;
  }
  return current;
}

/** The next rank above the current one, or null if already at the top. */
export function nextRank(level: number): Rank | null {
  for (const rank of RANKS) {
    if (rank.minLevel > level) return rank;
  }
  return null;
}
