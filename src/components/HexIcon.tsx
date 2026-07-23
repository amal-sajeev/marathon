import type { TaskType } from "../state/types";

const HEX_POINTS = "50,3 93.3,25 93.3,75 50,97 6.7,75 6.7,25";

export const TYPE_STYLE: Record<TaskType, { color: string; glyph: string }> = {
  daily: { color: "#38e6ff", glyph: "\u25C9" },
  habit: { color: "#b98cff", glyph: "\u21BB" },
  todo: { color: "#48e6a0", glyph: "\u2713" },
  reward: { color: "#ffc65a", glyph: "\u2666" },
};

interface Props {
  color: string;
  glyph: string;
  size?: number;
}

/** A glowing hexagon badge with a centered glyph - the app's core motif. */
export function HexIcon({ color, glyph, size = 44 }: Props) {
  return (
    <div className="hex-icon" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden
        style={{ filter: `drop-shadow(0 0 5px ${color}88)`, display: "block" }}
      >
        <polygon
          points={HEX_POINTS}
          fill={color}
          fillOpacity={0.14}
          stroke={color}
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="hex-icon__glyph"
        style={{ color, textShadow: `0 0 8px ${color}aa` }}
      >
        {glyph}
      </span>
    </div>
  );
}

export function TaskHexIcon({ type, size }: { type: TaskType; size?: number }) {
  const s = TYPE_STYLE[type];
  return <HexIcon color={s.color} glyph={s.glyph} size={size} />;
}
