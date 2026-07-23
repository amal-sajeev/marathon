interface TubeProps {
  kind: "hp" | "xp";
  value: number;
  max: number;
  icon: string;
  label: string;
}

export function Tube({ kind, value, max, icon, label }: TubeProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="gauge">
      <div className="gauge__icon">{icon}</div>
      <div className={`tube tube--${kind}`}>
        <div className="tube__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="gauge__label">{label}</div>
    </div>
  );
}

export function Coin({ amount }: { amount: number }) {
  return (
    <div className="coin" title="Gold">
      <span className="coin__disc">$</span>
      {Math.round(amount)}
    </div>
  );
}
