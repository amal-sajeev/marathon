import type { Character, Difficulty } from "./types";

export const DIFFICULTY_MULT: Record<Difficulty, number> = {
  trivial: 0.5,
  easy: 1,
  medium: 1.5,
  hard: 2,
};

/** XP required to advance from the given level to the next. */
export function xpForLevel(level: number): number {
  return Math.round(25 * level + 0.25 * level * level * 10);
}

export function maxHpForLevel(level: number): number {
  return 50 + (level - 1) * 5;
}

/** Stable nominal XP reward for a difficulty, used for the reward badge shown
 *  on task cards. Actual awarded XP varies slightly around this. */
export function nominalXp(difficulty: Difficulty): number {
  return Math.round(10 * DIFFICULTY_MULT[difficulty]);
}

export interface ScoreResult {
  character: Character;
  leveledUp: boolean;
  xpGained: number;
  goldGained: number;
  hpLost: number;
}

/**
 * Apply a positive completion: grant XP + gold scaled by difficulty.
 * Handles multi-level-ups and clamps values.
 */
export function applyGain(
  character: Character,
  difficulty: Difficulty,
): ScoreResult {
  const mult = DIFFICULTY_MULT[difficulty];
  const xpGained = Math.round((8 + Math.random() * 4) * mult);
  const goldGained = Math.round((3 + Math.random() * 4) * mult * 10) / 10;

  const next: Character = { ...character };
  next.xp += xpGained;
  next.gold = Math.round((next.gold + goldGained) * 10) / 10;

  let leveledUp = false;
  let needed = xpForLevel(next.level);
  while (next.xp >= needed) {
    next.xp -= needed;
    next.level += 1;
    next.maxHp = maxHpForLevel(next.level);
    next.hp = next.maxHp; // full heal on level up
    leveledUp = true;
    needed = xpForLevel(next.level);
  }

  return { character: next, leveledUp, xpGained, goldGained, hpLost: 0 };
}

/** Apply damage (bad habit, missed daily). Clamps HP at 0. */
export function applyDamage(
  character: Character,
  difficulty: Difficulty,
): ScoreResult {
  const mult = DIFFICULTY_MULT[difficulty];
  const hpLost = Math.round((6 + Math.random() * 3) * mult * 10) / 10;
  const next: Character = { ...character };
  next.hp = Math.max(0, Math.round((next.hp - hpLost) * 10) / 10);
  return { character: next, leveledUp: false, xpGained: 0, goldGained: 0, hpLost };
}

export interface ReviveResult {
  character: Character;
  died: boolean;
}

/**
 * If HP has hit zero, the adventurer "falls": they drop a level (min 1), lose
 * 20% of their gold, reset XP progress, and are restored to full HP. This is
 * what gives HP its stakes - missing dailies and bad habits actually cost you.
 */
export function reviveIfDead(character: Character): ReviveResult {
  if (character.hp > 0) return { character, died: false };
  const level = Math.max(1, character.level - 1);
  const maxHp = maxHpForLevel(level);
  const gold = Math.max(0, Math.round(character.gold * 0.8 * 10) / 10);
  return {
    character: { ...character, level, maxHp, hp: maxHp, xp: 0, gold },
    died: true,
  };
}

/** Spend gold on a reward. Returns null if unaffordable. */
export function spendGold(character: Character, cost: number): Character | null {
  if (character.gold < cost) return null;
  return { ...character, gold: Math.round((character.gold - cost) * 10) / 10 };
}
