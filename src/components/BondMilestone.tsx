import { useEffect } from "react";
import { useStore } from "../state/store";
import { BOND_STAGES } from "../game/bond";

/** A brief overlay when Leela and the user reach a new closeness stage. */
export function BondMilestone() {
  const index = useStore((s) => s.bondMilestone);
  const clear = useStore((s) => s.clearBondMilestone);

  useEffect(() => {
    if (index == null) return;
    const t = setTimeout(clear, 3400);
    return () => clearTimeout(t);
  }, [index, clear]);

  if (index == null || index <= 0) return null;
  const stage = BOND_STAGES[index];

  return (
    <div className="celebrate" onClick={clear}>
      <div className="celebrate__burst">
        <div className="celebrate__ring">{"\u2665"}</div>
        <div className="celebrate__title">{stage?.name ?? "Closer"}</div>
        <div className="celebrate__sub">You and Leela have grown closer.</div>
      </div>
    </div>
  );
}
