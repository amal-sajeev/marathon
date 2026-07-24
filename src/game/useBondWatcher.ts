import { useEffect } from "react";
import { useStore } from "../state/store";
import { bondStage } from "./bond";

/**
 * Fire a one-time milestone whenever the bond advances to a new stage. The
 * reached stage index is persisted (bond.lastStageIndex) so it never repeats.
 */
export function useBondWatcher(): void {
  const bond = useStore((s) => s.state.bond);
  const markBondStage = useStore((s) => s.markBondStage);

  useEffect(() => {
    const stage = bondStage(bond);
    const last = bond.lastStageIndex ?? 0;
    if (stage.index > last) markBondStage(stage.index);
  }, [bond, markBondStage]);
}
