import { useStore } from "../state/store";
import { xpForLevel } from "../state/scoring";
import { todayStr } from "../state/cron";
import { rankForLevel, nextRank } from "../game/ranks";
import { BOND_STAGES, bondStage, nextBondStage } from "../game/bond";
import { computeAchievements } from "../game/achievements";
import { runNightlyDebrief, runWeeklyReview } from "../agent/checkin";
import type { DayRecord, Habit } from "../state/types";
import { RankBadge } from "./RankBadge";

const HEATMAP_DAYS = 119; // 17 weeks

function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

function Heatmap({ history }: { history: DayRecord[] }) {
  const byDate = new Map(history.map((d) => [d.date, d]));
  const today = new Date();
  const cells: { key: string; level: number; count: number }[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = todayStr(d);
    const count = byDate.get(key)?.completed ?? 0;
    cells.push({ key, level: heatLevel(count), count });
  }
  return (
    <div className="heatmap" aria-hidden="true">
      {cells.map((c) => (
        <span
          key={c.key}
          className={`heatcell heatcell--${c.level}`}
          title={`${c.key}: ${c.count} done`}
        />
      ))}
    </div>
  );
}

function HabitBars({ habits }: { habits: Habit[] }) {
  if (habits.length === 0) return null;
  const max = Math.max(1, ...habits.map((h) => Math.max(h.countUp, h.countDown)));
  return (
    <div className="habit-bars">
      {habits.map((h) => (
        <div className="habit-bar" key={h.id}>
          <div className="habit-bar__title">{h.title}</div>
          <div className="habit-bar__track">
            <span
              className="habit-bar__up"
              style={{ width: `${(h.countUp / max) * 100}%` }}
            />
            <span
              className="habit-bar__down"
              style={{ width: `${(h.countDown / max) * 100}%` }}
            />
          </div>
          <div className="habit-bar__meta">+{h.countUp} / -{h.countDown}</div>
        </div>
      ))}
    </div>
  );
}

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
  const setWardrobeOpen = useStore((s) => s.setWardrobeOpen);
  const character = useStore((s) => s.state.character);
  const stats = useStore((s) => s.state.stats);
  const tasks = useStore((s) => s.state.tasks);
  const bond = useStore((s) => s.state.bond);
  const history = useStore((s) => s.state.history);
  const fullState = useStore((s) => s.state);
  const signature = useStore((s) => s.state.signature);
  const keepsakes = useStore((s) => s.state.keepsakes);

  if (!open) return null;

  const stage = bondStage(bond);
  const nextStage = nextBondStage(bond);
  const achievements = computeAchievements(fullState);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  // Letters up to the deepest stage reached (either currently, or ever celebrated).
  const reachedIndex = Math.max(stage.index, bond.lastStageIndex ?? 0);
  const letters = BOND_STAGES.filter((b) => b.index <= reachedIndex);
  const daysTogether = Math.max(
    0,
    Math.floor((Date.now() - new Date(bond.firstMet).getTime()) / 86_400_000),
  );

  const activeDailies = tasks.filter((t) => t.type === "daily").length;
  const activeTodos = tasks.filter((t) => t.type === "todo").length;
  const habitList = tasks.filter((t) => t.type === "habit") as Habit[];
  const activeHabits = habitList.length;
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
              label="Habits scored"
              value={stats.habitsScored.toLocaleString()}
            />
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

          <div className="trends">
            <div className="trends__label">Last 17 weeks</div>
            <Heatmap history={history} />
          </div>

          {habitList.length > 0 && (
            <div className="trends">
              <div className="trends__label">Habit balance</div>
              <HabitBars habits={habitList} />
            </div>
          )}

          <div className="trends">
            <div className="trends__label">
              Achievements ({unlockedCount}/{achievements.length})
            </div>
            <div className="ach-grid">
              {achievements.map((a) => (
                <div
                  key={a.id}
                  className={`ach ${a.unlocked ? "ach--on" : "ach--off"}`}
                  title={a.desc}
                >
                  <div className="ach__icon">{a.unlocked ? "\u2726" : "\u25ef"}</div>
                  <div className="ach__body">
                    <div className="ach__label">{a.label}</div>
                    <div className="ach__desc">{a.desc}</div>
                    {!a.unlocked && (
                      <div className="ach__track">
                        <span style={{ width: `${Math.round(a.progress * 100)}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn btn--sm"
              onClick={() => {
                setOpen(false);
                void runWeeklyReview();
              }}
            >
              Weekly review with Leela
            </button>
            <button
              className="btn btn--sm"
              onClick={() => {
                setOpen(false);
                void runNightlyDebrief();
              }}
            >
              Nightly debrief
            </button>
            <button
              className="btn btn--sm"
              onClick={() => {
                setOpen(false);
                setWardrobeOpen(true);
              }}
            >
              Wardrobe
            </button>
          </div>

          <div className="rank-strip" style={{ marginTop: 14 }}>
            <div className="rank-strip__meta">
              <div className="rank-strip__label">Bond with Leela</div>
              <div className="rank-strip__name">{stage.name}</div>
              <div className="rank-strip__progress">
                {daysTogether === 0
                  ? "together since today"
                  : `together ${daysTogether} ${daysTogether === 1 ? "day" : "days"}`}
                {nextStage ? " \u00b7 growing closer" : " \u00b7 as close as can be"}
              </div>
            </div>
          </div>

          {letters.length > 0 && (
            <div className="trends">
              <div className="trends__label">Notes from Leela</div>
              <div className="letters">
                {letters.map((b) => (
                  <div className="letter" key={b.index}>
                    <div className="letter__stage">{b.name}</div>
                    <div className="letter__text">{b.letter}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {keepsakes.length > 0 && (
            <div className="trends">
              <div className="trends__label">Keepsakes</div>
              <div className="letters">
                {keepsakes.slice(0, 12).map((k) => (
                  <div className="letter" key={k.id}>
                    <div className="letter__stage">
                      {k.kind} · {new Date(k.createdAt).toLocaleDateString()}
                    </div>
                    <div className="letter__title">{k.title}</div>
                    <div className="letter__text">{k.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(signature.codeword ||
            signature.energyWord ||
            signature.bits.length > 0 ||
            Object.keys(signature.nicknames).length > 0) && (
            <div className="trends">
              <div className="trends__label">Your shared texture</div>
              <div className="sig-block">
                {signature.codeword && (
                  <div className="sig-line">
                    <span className="sig-k">Codeword</span> {signature.codeword}
                  </div>
                )}
                {signature.energyWord && (
                  <div className="sig-line">
                    <span className="sig-k">Low-energy</span> {signature.energyWord}
                  </div>
                )}
                {Object.entries(signature.nicknames).map(([id, nick]) => {
                  const t = tasks.find((x) => x.id === id);
                  if (!t) return null;
                  return (
                    <div className="sig-line" key={id}>
                      <span className="sig-k">{nick}</span> → {t.title}
                    </div>
                  );
                })}
                {signature.bits.map((b) => (
                  <div className="sig-line sig-line--bit" key={b}>
                    {b}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="hint" style={{ marginTop: 12 }}>
            A streak grows for every day you clear all your active dailies. Miss
            one and it resets. Let your HP hit zero and you fall - dropping a level
            and 20% of your gold - so guard it. Closeness with Leela still grows
            on its own clock; shared bits and letters sit beside it.
          </div>
        </div>
      </div>
    </>
  );
}
