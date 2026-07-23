import { useStore } from "../state/store";
import { xpForLevel } from "../state/scoring";
import { rankForLevel, nextRank } from "../game/ranks";
import { RankBadge } from "./RankBadge";

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "xp" | "gold" | "hp" | "streak";
}) {
  return (
    <div className={`stat-card ${accent ? `stat-card--${accent}` : ""}`}>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
      {sub && <div className="stat-card__sub">{sub}</div>}
    </div>
  );
}

export function StatsPanel() {
  const open = useStore((s) => s.statsOpen);
  const setOpen = useStore((s) => s.setStatsOpen);
  const character = useStore((s) => s.state.character);
  const stats = useStore((s) => s.state.stats);
  const tasks = useStore((s) => s.state.tasks);

  if (!open) return null;

  const activeDailies = tasks.filter((t) => t.type === "daily").length;
  const activeTodos = tasks.filter((t) => t.type === "todo").length;
  const activeHabits = tasks.filter((t) => t.type === "habit").length;
  const xpNeeded = xpForLevel(character.level);
  const rank = rankForLevel(character.level);
  const upcoming = nextRank(character.level);
  const toNext = upcoming ? upcoming.minLevel - character.level : 0;

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="sheet">
        <div className="sheet__grip" />
        <div className="sheet__head">
          <span className="sheet__title">Service Record</span>
          <button
            className="icon-btn"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            {"\u2715"}
          </button>
        </div>

        <div className="sheet__body">
          <div className="rank-strip">
            <div className="rank-strip__badge">
              <RankBadge level={character.level} size={72} />
            </div>
            <div className="rank-strip__meta">
              <div className="rank-strip__label">Current rank</div>
              <div className="rank-strip__name">{rank.name}</div>
              <div className="rank-strip__progress">
                {upcoming
                  ? `${toNext} ${toNext === 1 ? "level" : "levels"} to ${upcoming.name}`
                  : "Highest rank achieved"}
              </div>
            </div>
          </div>

          <div className="stat-grid">
            <StatCard label="Level" value={character.level} sub={rank.name} />
            <StatCard
              label="XP this level"
              value={`${character.xp} / ${xpNeeded}`}
              accent="xp"
            />
            <StatCard
              label="Total XP earned"
              value={stats.totalXp.toLocaleString()}
              accent="xp"
            />
            <StatCard
              label="Missions completed"
              value={stats.tasksCompleted.toLocaleString()}
            />
            <StatCard
              label="Current streak"
              value={stats.currentStreak}
              sub={stats.currentStreak === 1 ? "day" : "days"}
              accent="streak"
            />
            <StatCard
              label="Longest streak"
              value={stats.longestStreak}
              sub={stats.longestStreak === 1 ? "day" : "days"}
              accent="streak"
            />
            <StatCard label="Gold" value={character.gold} accent="gold" />
            <StatCard
              label="Times fallen"
              value={stats.timesFallen}
              accent="hp"
            />
          </div>

          <div className="stat-strip">
            <span>{activeDailies} dailies</span>
            <span>{activeHabits} habits</span>
            <span>{activeTodos} to-dos</span>
          </div>

          <div className="hint" style={{ marginTop: 12 }}>
            A streak grows for every day you clear all your active dailies. Miss
            one and it resets. Let your HP hit zero and you fall - dropping a level
            and 20% of your gold - so guard it.
          </div>
        </div>
      </div>
    </>
  );
}
