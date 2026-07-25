import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { crackIntensity, lockedEmotion, negativeExpressionActive } from "../game/mood";
import { isEmotion, type Emotion } from "./emotions";

/**
 * The face she wears when nothing is actively happening.
 *
 * After a day where she took a hit this stays fallen until midnight rather
 * than resetting on the next message, which is the whole point of the lock.
 * Below the onset bond stage it is always neutral, so a brand new save behaves
 * exactly as it did before any of this existed.
 */
export function useRestingFace(): Emotion {
  const mood = useStore((s) => s.state.leelaMood);
  const bond = useStore((s) => s.state.bond);
  const settings = useStore((s) => s.settings);

  if (!negativeExpressionActive(bond, settings)) return "neutral";
  const locked = lockedEmotion(mood);
  return locked && isEmotion(locked) ? locked : "neutral";
}

/**
 * How cracked her portrait glass is right now, 0..1.
 *
 * Re-reads on a slow timer because the value decays with wall-clock time
 * rather than with state changes, so nothing would otherwise re-render it.
 */
export function useCrack(): number {
  const mood = useStore((s) => s.state.leelaMood);
  const bond = useStore((s) => s.state.bond);
  const settings = useStore((s) => s.settings);
  const [, setTick] = useState(0);

  const damageAt = mood?.damageAt;
  useEffect(() => {
    if (!damageAt) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [damageAt]);

  if (!negativeExpressionActive(bond, settings)) return 0;
  return crackIntensity(mood);
}
