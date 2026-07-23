import { useId } from "react";
import { rankForLevel } from "../game/ranks";

interface Props {
  level: number;
  size?: number;
}

const HEX = "50,5 89,27 89,73 50,95 11,73 11,27";

/** Build an SVG path for an n-pointed star centered at (cx, cy). */
function starPath(cx: number, cy: number, points: number, outer: number, inner: number): string {
  const step = Math.PI / points;
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = i * step - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d + "Z";
}

function Glyph({ tier, color }: { tier: number; color: string }) {
  if (tier <= 1) return <circle cx="50" cy="46" r="5.5" fill={color} />;
  if (tier === 2)
    return <path d="M50 39 L57 52 L43 52 Z" fill={color} />;
  const points = tier >= 7 ? 6 : tier >= 5 ? 5 : 4;
  const outer = tier >= 7 ? 12 : 10;
  return <path d={starPath(50, 46, points, outer, outer * 0.42)} fill={color} />;
}

function Chevrons({ tier, color }: { tier: number; color: string }) {
  const count = tier >= 6 ? 3 : tier >= 4 ? 2 : tier >= 3 ? 1 : 0;
  const rows = [];
  for (let i = 0; i < count; i++) {
    const y = 66 + i * 7;
    rows.push(
      <path
        key={i}
        d={`M34 ${y} L50 ${y - 7} L66 ${y}`}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />,
    );
  }
  return <g>{rows}</g>;
}

export function RankBadge({ level, size = 100 }: Props) {
  const rank = rankForLevel(level);
  const { tier, color } = rank;
  const gid = useId().replace(/:/g, "");

  const rings = tier >= 8 ? 2 : tier >= 5 ? 1 : 0;
  const sidePips = tier >= 7;

  return (
    <svg
      className="badge"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${rank.name} insignia`}
    >
      <defs>
        <filter id={`bg-${gid}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`plate-${gid}`} cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor={`${color}2e`} />
          <stop offset="100%" stopColor="#020609" />
        </radialGradient>
      </defs>

      <g filter={`url(#bg-${gid})`}>
        {/* outer rings for high ranks */}
        {rings >= 1 && (
          <circle cx="50" cy="50" r="47" fill="none" stroke={color} strokeWidth="1.4" opacity="0.55" />
        )}
        {rings >= 2 && (
          <circle
            cx="50"
            cy="50"
            r="49"
            fill="none"
            stroke={color}
            strokeWidth="1"
            strokeDasharray="3 5"
            opacity="0.5"
          />
        )}

        {/* hex plate */}
        <polygon points={HEX} fill={`url(#plate-${gid})`} stroke={color} strokeWidth="3" strokeLinejoin="round" />
        <polygon
          points={HEX}
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity="0.35"
          transform="translate(50 50) scale(0.82) translate(-50 -50)"
        />

        {/* side pips */}
        {sidePips && (
          <>
            <circle cx="22" cy="50" r="2.4" fill={color} />
            <circle cx="78" cy="50" r="2.4" fill={color} />
          </>
        )}

        <Glyph tier={tier} color={color} />
        <Chevrons tier={tier} color={color} />
      </g>
    </svg>
  );
}
