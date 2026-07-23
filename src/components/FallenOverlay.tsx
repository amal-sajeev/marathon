import { useEffect } from "react";
import { useStore } from "../state/store";

export function FallenOverlay() {
  const level = useStore((s) => s.fallen);
  const clear = useStore((s) => s.clearFallen);

  useEffect(() => {
    if (level == null) return;
    const t = setTimeout(clear, 2600);
    return () => clearTimeout(t);
  }, [level, clear]);

  if (level == null) return null;

  return (
    <div className="fallen" onClick={clear}>
      <div className="fallen__burst">
        <div className="fallen__ring">{"\u2620"}</div>
        <div className="fallen__title">You fell</div>
        <div className="fallen__sub">
          Back to level {level}. Rise again - the streak awaits.
        </div>
      </div>
    </div>
  );
}
