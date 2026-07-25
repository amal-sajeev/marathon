import type { Bond, LeelaMood, Settings } from "../state/types";
import { bondStage } from "./bond";

/** Where she sits when nothing has happened either way. */
export const MOOD_BASELINE = 60;
/** Below this she reads as genuinely low, which arms the opener and the relief. */
export const MOOD_LOW = 40;

/**
 * Whether Leela is allowed to *show* a bad mood at all: the resting face stays
 * fallen for the day after one goes badly.
 *
 * The arithmetic in cron always runs; only the expression is gated. At stage 0
 * she has no standing to be hurt yet, and a wounded reaction from someone you
 * met yesterday reads as manipulation rather than disappointment. Stage 1
 * ("Warming up", minScore 24) lands within the first week, which is early
 * enough to matter and late enough to have been earned.
 *
 * The positive half is never gated by this.
 */
export function negativeExpressionActive(bond: Bond, settings: Settings): boolean {
  if ((settings.reactiveMood ?? "full") === "off") return false;
  return bondStage(bond).index >= 1;
}

/**
 * The sharper end of it: cracked glass, the disappointed opener, the guilt
 * notifications. On "gentle" she still wears the day on her face but never
 * confronts anyone about it.
 */
export function guiltActive(bond: Bond, settings: Settings): boolean {
  if ((settings.reactiveMood ?? "full") !== "full") return false;
  return negativeExpressionActive(bond, settings);
}

/** A locked expression only counts while it hasn't expired. */
export function lockedEmotion(mood: LeelaMood | undefined, now = new Date()): string | null {
  if (!mood?.lockedEmotion || !mood.lockedUntil) return null;
  return new Date(mood.lockedUntil).getTime() > now.getTime() ? mood.lockedEmotion : null;
}

/**
 * How cracked her portrait glass is, 0..1, decaying over the 24 hours after the
 * last time a missed daily cost health.
 */
export function crackIntensity(mood: LeelaMood | undefined, now = new Date()): number {
  if (!mood?.damageAt) return 0;
  const age = now.getTime() - new Date(mood.damageAt).getTime();
  if (!Number.isFinite(age) || age < 0) return 0;
  const remaining = 1 - age / 86_400_000;
  return remaining > 0 ? Math.min(1, remaining) : 0;
}

/** A short phrase for her current state, used in context and the diary. */
export function moodLabel(value: number): string {
  if (value >= 85) return "buoyant";
  if (value >= 70) return "good";
  if (value >= 50) return "steady";
  if (value >= 35) return "flat";
  if (value >= 20) return "low";
  return "quite low";
}
