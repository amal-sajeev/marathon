import { useEffect } from "react";
import { useStore } from "../state/store";

export function Celebrate() {
  const level = useStore((s) => s.celebrateLevel);
  const clear = useStore((s) => s.clearCelebrate);

  useEffect(() => {
    if (level == null) return;
    const t = setTimeout(clear, 2200);
    return () => clearTimeout(t);
  }, [level, clear]);

  if (level == null) return null;

  return (
    <div className="celebrate" onClick={clear}>
      <div className="celebrate__burst">
        <div className="celebrate__ring">{"\u2726"}</div>
        <div className="celebrate__title">Level {level}</div>
        <div className="celebrate__sub">Wounds mended. New strength earned.</div>
      </div>
    </div>
  );
}
