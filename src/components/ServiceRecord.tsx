import { useEffect, useMemo, useState } from "react";

import { useStore } from "../state/store";
import { xpForLevel } from "../state/scoring";
import { todayStr } from "../state/cron";
import { rankForLevel, nextRank } from "../game/ranks";
import { bondStage, nextBondStage } from "../game/bond";
import { computeAchievements } from "../game/achievements";
import { computeInsights, dayFacts } from "../game/insights";
import { runNightlyDebrief, runWeeklyReview } from "../agent/checkin";
import { isEmotion, type Emotion } from "../agent/emotions";
import { FaceAvatar } from "../agent/FaceAvatar";
import type { DayRecord, GameState, Habit, Keepsake } from "../state/types";
import { RankBadge } from "./RankBadge";

type Tab = "timeline" | "read" | "stats";

/** Kinds the timeline can be narrowed to, in the order the chips appear. */
const KINDS = [
  ["diary", "Diary"],
  ["read", "Her read"],
  ["letter", "Letters"],
  ["milestone", "Milestones"],
  ["ritual", "Rituals"],
] as const;

type Kind = (typeof KINDS)[number][0];

const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const DAY = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** The day an entry belongs to: what a diary page is about, else when it was filed. */
function entryDate(k: Keepsake): string {
  return k.date ?? k.createdAt.slice(0, 10);
}

function faceOf(k: Keepsake): Emotion {
  return k.emotion && isEmotion(k.emotion) ? k.emotion : "neutral";
}

export function ServiceRecord() {
  const open = useStore((s) => s.recordOpen);
  const setOpen = useStore((s) => s.setRecordOpen);
  const setWardrobeOpen = useStore((s) => s.setWardrobeOpen);
  const state = useStore((s) => s.state);

  const [tab, setTab] = useState<Tab>("timeline");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const entries = useMemo(
    () =>
      [...state.keepsakes].sort((a, b) => entryDate(b).localeCompare(entryDate(a))),
    [state.keepsakes],
  );

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      entries.filter((k) => {
        if (kind && k.kind !== kind) return false;
        if (!q) return true;
        return (
          k.title.toLowerCase().includes(q) || k.text.toLowerCase().includes(q)
        );
      }),
    [entries, kind, q],
  );

  if (!open) return null;

  const counts = new Map<string, number>();
  for (const k of entries) counts.set(k.kind, (counts.get(k.kind) ?? 0) + 1);

  const search = (value: string) => {
    setQuery(value);
    if (value.trim()) setTab("timeline");
  };

  return (
    <div className="record" role="dialog" aria-label="Service Record">
      <header className="record__head">
        <div className="record__titles">
          <h2 className="record__title">Service Record</h2>
          <span className="record__sub">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <div className="record__actions">
          <button
            className="icon-btn"
            onClick={() => exportRecord(state)}
            aria-label="Export record"
            title="Export as Markdown"
          >
            {"\u2913"}
          </button>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            {"\u2715"}
          </button>
        </div>
      </header>

      <div className="record__search">
        <input
          className="input input--search"
          value={query}
          placeholder="Search everything she's written..."
          onChange={(e) => search(e.target.value)}
          autoComplete="off"
        />
        {q ? (
          <button className="record__clear" onClick={() => search("")} aria-label="Clear">
            {"\u2715"}
          </button>
        ) : null}
      </div>

      <nav className="record__tabs" role="tablist">
        {(
          [
            ["timeline", "Timeline"],
            ["read", "Her read"],
            ["stats", "Statistics"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`record__tab ${tab === id ? "record__tab--on" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="record__body">
        {tab === "timeline" && (
          <Timeline
            entries={matches}
            state={state}
            counts={counts}
            kind={kind}
            setKind={setKind}
            searching={q.length > 0}
            total={entries.length}
          />
        )}
        {tab === "read" && <HerRead state={state} />}
        {tab === "stats" && (
          <Statistics
            state={state}
            onClose={() => setOpen(false)}
            openWardrobe={() => {
              setOpen(false);
              setWardrobeOpen(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- timeline */

function Timeline({
  entries,
  state,
  counts,
  kind,
  setKind,
  searching,
  total,
}: {
  entries: Keepsake[];
  state: GameState;
  counts: Map<string, number>;
  kind: Kind | null;
  setKind: (k: Kind | null) => void;
  searching: boolean;
  total: number;
}) {
  // Grouped by month so a year of pages stays navigable by scrolling.
  const months = useMemo(() => {
    const out: Array<{ key: string; label: string; items: Keepsake[] }> = [];
    for (const entry of entries) {
      const date = entryDate(entry);
      const key = date.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(entry);
      else {
        out.push({
          key,
          label: MONTH.format(new Date(`${date}T00:00:00`)),
          items: [entry],
        });
      }
    }
    return out;
  }, [entries]);

  return (
    <>
      <div className="tag-chips record__chips">
        <button
          className={`tag-chip ${kind === null ? "tag-chip--on" : ""}`}
          onClick={() => setKind(null)}
        >
          All
        </button>
        {KINDS.filter(([id]) => counts.get(id)).map(([id, label]) => (
          <button
            key={id}
            className={`tag-chip ${kind === id ? "tag-chip--on" : ""}`}
            onClick={() => setKind(kind === id ? null : id)}
          >
            {label} <span className="tag-chip__n">{counts.get(id)}</span>
          </button>
        ))}
      </div>

      {searching ? (
        <div className="record__count">
          {entries.length} of {total} {entries.length === 1 ? "entry" : "entries"}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <p className="hint">
          {total === 0
            ? "Nothing filed yet. Leela writes a page at the end of each day, and leaves notes here when something is worth keeping."
            : "Nothing here matches that."}
        </p>
      ) : (
        months.map((month) => (
          <section className="record__month" key={month.key}>
            <h3 className="record__month-label">{month.label}</h3>
            {month.items.map((entry) => (
              <Entry key={entry.id} entry={entry} state={state} />
            ))}
          </section>
        ))
      )}
    </>
  );
}

/**
 * One filed entry. Diary pages and reads carry her face and, where the day is
 * known, what actually happened that day, so her account of it sits next to
 * the record of it.
 */
function Entry({ entry, state }: { entry: Keepsake; state: GameState }) {
  const date = entryDate(entry);
  // Her own writing is titled with its own date, which the meta row already
  // shows. Only the filed notes have a title worth printing.
  const faced = entry.kind === "diary" || entry.kind === "read";
  const facts = entry.kind === "diary" ? dayFacts(state, date) : null;

  return (
    <article className={`entry entry--${entry.kind}`}>
      {faced ? (
        <div className="entry__face">
          <FaceAvatar emotion={faceOf(entry)} />
        </div>
      ) : (
        <div className="entry__pip" aria-hidden="true" />
      )}
      <div className="entry__body">
        <div className="entry__meta">
          <span className="entry__kind">{labelFor(entry.kind)}</span>
          <span className="entry__date">{DAY.format(new Date(`${date}T00:00:00`))}</span>
        </div>
        {!faced && entry.title ? (
          <div className="entry__title">{entry.title}</div>
        ) : null}
        <p className="entry__text">{entry.text}</p>
        {facts ? (
          <div className="entry__facts">
            {facts.completed === 0
              ? "Nothing finished that day"
              : `${facts.completed} finished, ${facts.xp} XP`}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function labelFor(kind: Keepsake["kind"]): string {
  if (kind === "read") return "Her read";
  if (kind === "diary") return "Diary";
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/* ---------------------------------------------------------------- her read */

function HerRead({ state }: { state: GameState }) {
  const reads = state.keepsakes.filter((k) => k.kind === "read");
  const current = reads[0];
  const older = reads.slice(1);
  const insights = computeInsights(state);
  const stage = bondStage(state.bond);
  const next = nextBondStage(state.bond);
  const signature = state.signature;
  const daysTogether = Math.max(
    0,
    Math.floor((Date.now() - new Date(state.bond.firstMet).getTime()) / 86_400_000),
  );

  const hasTexture =
    !!signature.codeword ||
    !!signature.energyWord ||
    signature.bits.length > 0 ||
    Object.keys(signature.nicknames).length > 0;

  return (
    <>
      <section className="read-now">
        <div className="read-now__head">
          <div className="read-now__face">
            <FaceAvatar emotion={current ? faceOf(current) : "neutral"} />
          </div>
          <div>
            <div className="read-now__label">Where she thinks you stand</div>
            <div className="read-now__when">
              {current ? current.title : "Not written yet"}
            </div>
          </div>
        </div>
        <p className="read-now__text">
          {current
            ? current.text
            : "She hasn't formed a settled view yet. Give her a week of days to look at and ask her what she makes of it."}
        </p>
      </section>

      <section className="record__section">
        <h3 className="record__section-label">What the record shows</h3>
        {insights.length === 0 ? (
          <p className="hint">
            Not enough days on file yet to say anything honest about patterns.
          </p>
        ) : (
          <div className="insights">
            {insights.map((i) => (
              <div className={`insight insight--${i.tone}`} key={i.id}>
                <div className="insight__label">{i.label}</div>
                <div className="insight__detail">{i.detail}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="record__section">
        <h3 className="record__section-label">Bond</h3>
        <div className="rank-strip">
          <div className="rank-strip__meta">
            <div className="rank-strip__label">{stage.name}</div>
            <div className="rank-strip__progress">
              {daysTogether === 0
                ? "together since today"
                : `together ${daysTogether} ${daysTogether === 1 ? "day" : "days"}`}
              {next ? " \u00b7 growing closer" : " \u00b7 as close as can be"}
            </div>
          </div>
        </div>
      </section>

      {hasTexture && (
        <section className="record__section">
          <h3 className="record__section-label">Yours specifically</h3>
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
              const task = state.tasks.find((x) => x.id === id);
              if (!task) return null;
              return (
                <div className="sig-line" key={id}>
                  <span className="sig-k">{nick}</span> {task.title}
                </div>
              );
            })}
            {signature.bits.map((bit) => (
              <div className="sig-line sig-line--bit" key={bit}>
                {bit}
              </div>
            ))}
          </div>
        </section>
      )}

      {older.length > 0 && (
        <section className="record__section">
          <h3 className="record__section-label">How her view has changed</h3>
          <div className="letters">
            {older.map((r) => (
              <div className="letter" key={r.id}>
                <div className="letter__stage">{r.title}</div>
                <div className="letter__text">{r.text}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* -------------------------------------------------------------- statistics */

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
            <span className="habit-bar__up" style={{ width: `${(h.countUp / max) * 100}%` }} />
            <span
              className="habit-bar__down"
              style={{ width: `${(h.countDown / max) * 100}%` }}
            />
          </div>
          <div className="habit-bar__meta">
            +{h.countUp} / -{h.countDown}
          </div>
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

function Statistics({
  state,
  onClose,
  openWardrobe,
}: {
  state: GameState;
  onClose: () => void;
  openWardrobe: () => void;
}) {
  const { character, stats, tasks, history } = state;
  const achievements = computeAchievements(state);
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const habits = tasks.filter((t): t is Habit => t.type === "habit");
  const rank = rankForLevel(character.level);
  const upcoming = nextRank(character.level);
  const toNext = upcoming ? upcoming.minLevel - character.level : 0;

  return (
    <>
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
          value={`${character.xp} / ${xpForLevel(character.level)}`}
          accent="xp"
        />
        <StatCard label="Total XP earned" value={stats.totalXp.toLocaleString()} accent="xp" />
        <StatCard label="Missions completed" value={stats.tasksCompleted.toLocaleString()} />
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
        <StatCard label="Habits scored" value={stats.habitsScored.toLocaleString()} />
        <StatCard label="Times fallen" value={stats.timesFallen} accent="hp" />
      </div>

      <div className="trends">
        <div className="trends__label">Last 17 weeks</div>
        <Heatmap history={history} />
      </div>

      {habits.length > 0 && (
        <div className="trends">
          <div className="trends__label">Habit balance</div>
          <HabitBars habits={habits} />
        </div>
      )}

      <div className="trends">
        <div className="trends__label">
          Achievements ({unlocked}/{achievements.length})
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
            onClose();
            void runWeeklyReview();
          }}
        >
          Weekly review with Leela
        </button>
        <button
          className="btn btn--sm"
          onClick={() => {
            onClose();
            void runNightlyDebrief();
          }}
        >
          Nightly debrief
        </button>
        <button className="btn btn--sm" onClick={openWardrobe}>
          Wardrobe
        </button>
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        A streak grows for every day you clear all your active dailies. Miss one and it
        resets. Let your HP hit zero and you fall, dropping a level and 20% of your gold,
        so guard it. Closeness with Leela grows on its own clock.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ export */

/**
 * The whole record as Markdown. It is their diary as much as hers, and a save
 * file they can't read without the app is a worse promise than the one the
 * rest of this makes about owning your own data.
 */
function exportRecord(state: GameState): void {
  const lines: string[] = [
    `# Service Record: ${state.character.name}`,
    "",
    `Exported ${new Date().toLocaleDateString()}. Level ${state.character.level}, ` +
      `${state.stats.tasksCompleted} missions completed, longest streak ` +
      `${state.stats.longestStreak} days.`,
    "",
  ];

  const insights = computeInsights(state);
  if (insights.length > 0) {
    lines.push("## What the record shows", "");
    for (const i of insights) lines.push(`- **${i.label}:** ${i.detail}`);
    lines.push("");
  }

  const entries = [...state.keepsakes].sort((a, b) =>
    entryDate(b).localeCompare(entryDate(a)),
  );
  if (entries.length > 0) {
    lines.push("## Entries", "");
    for (const entry of entries) {
      const date = entryDate(entry);
      lines.push(`### ${date} \u2014 ${labelFor(entry.kind)}`);
      if (entry.kind !== "diary" && entry.title) lines.push(`*${entry.title}*`);
      lines.push("", entry.text, "");
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `service-record-${todayStr()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
