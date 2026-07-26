/**
 * What the record actually shows, worked out from the save rather than guessed
 * at by the model.
 *
 * Leela is asked to have opinions about how someone is doing. An opinion needs
 * evidence, and a language model handed a raw task list will invent the
 * evidence. So the arithmetic happens here, deterministically, and she is given
 * findings to voice rather than numbers to interpret.
 *
 * Every finding is suppressed when the data behind it is too thin to mean
 * anything. A confident read of four days of history is how she ends up
 * sounding like a horoscope.
 */

import { isDailyActiveOn, shiftDays, todayStr } from "../state/cron";
import type { Daily, GameState, Habit, Keepsake } from "../state/types";

export interface Insight {
  id: string;
  /** short heading for the Record */
  label: string;
  /** the finding in plain words, shown to the user and handed to Leela */
  detail: string;
  /** which way it cuts, for colour in the UI and tone in her voice */
  tone: "good" | "bad" | "neutral";
  /** how much it deserves attention, 0..1, used for ordering */
  weight: number;
}

const DAY_NAMES = [
  "Sundays", "Mondays", "Tuesdays", "Wednesdays",
  "Thursdays", "Fridays", "Saturdays",
];

/** Completions per day, with absent days read as zero rather than unknown. */
function dailySeries(state: GameState, days: number, now: Date): number[] {
  const byDate = new Map(state.history.map((d) => [d.date, d.completed]));
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(Math.max(0, byDate.get(shiftDays(now, -i)) ?? 0));
  }
  return out;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** How many days of record there are to reason from. */
function daysObserved(state: GameState, now: Date): number {
  const first = state.history[0]?.date ?? state.bond.firstMet.slice(0, 10);
  const start = new Date(`${first}T00:00:00`).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / 86_400_000)) + 1;
}

function momentum(state: GameState, now: Date): Insight | null {
  const fortnight = dailySeries(state, 14, now);
  const recent = sum(fortnight.slice(7));
  const prior = sum(fortnight.slice(0, 7));
  if (recent + prior < 6) return null;

  const delta = recent - prior;
  if (Math.abs(delta) < Math.max(3, prior * 0.25)) {
    return {
      id: "momentum",
      label: "Momentum",
      detail: `${recent} finished this week, ${prior} the week before. Holding steady.`,
      tone: "neutral",
      weight: 0.4,
    };
  }
  return {
    id: "momentum",
    label: "Momentum",
    detail:
      delta > 0
        ? `${recent} finished this week, up from ${prior} the week before.`
        : `${recent} finished this week, down from ${prior} the week before.`,
    tone: delta > 0 ? "good" : "bad",
    weight: 0.85,
  };
}

function weekdayShape(state: GameState, now: Date): Insight | null {
  const span = 56;
  if (daysObserved(state, now) < 21) return null;

  const totals = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  const series = dailySeries(state, span, now);
  for (let i = 0; i < span; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (span - 1 - i));
    const day = date.getDay();
    totals[day] += series[i];
    counts[day] += 1;
  }

  const averages = totals.map((t, i) => (counts[i] ? t / counts[i] : 0));
  if (sum(totals) < 10) return null;

  let best = 0;
  let worst = 0;
  averages.forEach((a, i) => {
    if (a > averages[best]) best = i;
    if (a < averages[worst]) worst = i;
  });
  if (averages[best] - averages[worst] < 0.8) return null;

  return {
    id: "weekday",
    label: "Shape of your week",
    detail: `${DAY_NAMES[best]} are your strongest at ${round1(averages[best])} a day. ${DAY_NAMES[worst]} are your weakest at ${round1(averages[worst])}.`,
    tone: "neutral",
    weight: 0.7,
  };
}

function anchor(state: GameState): Insight | null {
  const dailies = state.tasks.filter((t): t is Daily => t.type === "daily");
  const best = dailies.reduce<Daily | null>(
    (top, d) => (!top || d.streak > top.streak ? d : top),
    null,
  );
  if (!best || best.streak < 5) return null;
  return {
    id: "anchor",
    label: "Your anchor",
    detail: `"${best.title}" has held for ${best.streak} days, longer than anything else on the board.`,
    tone: "good",
    weight: 0.75,
  };
}

function weakLink(state: GameState, now: Date): Insight | null {
  const dailies = state.tasks
    .filter((t): t is Daily => t.type === "daily")
    .filter((d) => isDailyActiveOn(d, now) && d.streak === 0 && !d.done);
  if (dailies.length === 0) return null;

  // The one she suggested carries more weight than one they set themselves.
  const hers = dailies.find((d) => d.suggestedByLeela);
  const target = hers ?? dailies[0];
  return {
    id: "weak-link",
    label: "Weak link",
    detail:
      dailies.length > 2
        ? `${dailies.length} dailies are sitting at zero streak, including "${target.title}".`
        : `"${target.title}" is on a zero streak and due today.`,
    tone: "bad",
    weight: hers ? 0.9 : 0.65,
  };
}

function drought(state: GameState, now: Date): Insight | null {
  const series = dailySeries(state, 60, now);
  if (daysObserved(state, now) < 14) return null;

  let longest = 0;
  let run = 0;
  // Today doesn't count as a gap yet; the day isn't over.
  for (const value of series.slice(0, -1)) {
    run = value === 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  if (longest < 3) return null;
  return {
    id: "drought",
    label: "Longest quiet stretch",
    detail: `${longest} days in a row with nothing finished, inside the last two months.`,
    tone: "bad",
    weight: 0.5,
  };
}

function bestWeek(state: GameState, now: Date): Insight | null {
  const span = Math.min(120, Math.max(14, daysObserved(state, now)));
  const series = dailySeries(state, span, now);
  if (series.length < 14) return null;

  let best = 0;
  let bestEnd = 6;
  for (let i = 6; i < series.length; i++) {
    const window = sum(series.slice(i - 6, i + 1));
    if (window > best) {
      best = window;
      bestEnd = i;
    }
  }
  if (best < 5) return null;

  const current = sum(series.slice(-7));
  const isNow = bestEnd >= series.length - 2;
  return {
    id: "best-week",
    label: "Best week on record",
    detail: isNow
      ? `${best} in seven days. That's happening right now.`
      : `${best} in seven days. This week stands at ${current}.`,
    tone: isNow ? "good" : "neutral",
    weight: isNow ? 0.9 : 0.45,
  };
}

function consistency(state: GameState, now: Date): Insight | null {
  const observed = daysObserved(state, now);
  if (observed < 14) return null;
  const span = Math.min(observed, 90);
  const series = dailySeries(state, span, now);
  const active = series.filter((v) => v > 0).length;
  const share = Math.round((active / span) * 100);
  return {
    id: "consistency",
    label: "Showing up",
    detail: `Something got finished on ${share}% of the last ${span} days.`,
    tone: share >= 60 ? "good" : share >= 35 ? "neutral" : "bad",
    weight: 0.55,
  };
}

function habitDrift(state: GameState): Insight | null {
  const habits = state.tasks.filter((t): t is Habit => t.type === "habit");
  const slipping = habits
    .filter((h) => h.countDown + h.countUp >= 6)
    .sort((a, b) => b.countDown / (b.countUp + 1) - a.countDown / (a.countUp + 1))[0];
  if (!slipping || slipping.countDown <= slipping.countUp) return null;
  return {
    id: "habit-drift",
    label: "Going the wrong way",
    detail: `"${slipping.title}" has gone down ${slipping.countDown} times against ${slipping.countUp} up.`,
    tone: "bad",
    weight: 0.7,
  };
}

function overload(state: GameState, now: Date): Insight | null {
  const active = state.tasks.filter(
    (t): t is Daily => t.type === "daily" && isDailyActiveOn(t, now),
  ).length;
  if (active < 4 || daysObserved(state, now) < 14) return null;

  const series = dailySeries(state, 14, now);
  const typical = sum(series) / series.length;
  if (typical >= active * 0.6) return null;
  return {
    id: "overload",
    label: "Board vs reality",
    detail: `${active} dailies due today, against a recent average of ${round1(typical)} finished a day.`,
    tone: "bad",
    weight: 0.8,
  };
}

function moodMirror(state: GameState): Insight | null {
  const pages = state.keepsakes
    .filter((k: Keepsake) => k.kind === "diary" && k.emotion)
    .slice(0, 14);
  if (pages.length < 5) return null;

  const tally = new Map<string, number>();
  for (const page of pages) {
    const key = page.emotion as string;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const [emotion, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (count < Math.ceil(pages.length / 2)) return null;
  return {
    id: "mood-mirror",
    label: "How it's been landing",
    detail: `She's written ${count} of the last ${pages.length} pages ${emotion}.`,
    tone: ["happy", "excited", "laughing", "confident"].includes(emotion)
      ? "good"
      : ["sad", "worried", "serious"].includes(emotion)
        ? "bad"
        : "neutral",
    weight: 0.6,
  };
}

/** Everything worth saying about this save, strongest finding first. */
export function computeInsights(state: GameState, now: Date = new Date()): Insight[] {
  const found = [
    momentum(state, now),
    weekdayShape(state, now),
    anchor(state),
    weakLink(state, now),
    drought(state, now),
    bestWeek(state, now),
    consistency(state, now),
    habitDrift(state),
    overload(state, now),
    moodMirror(state),
  ].filter((i): i is Insight => i !== null);

  return found.sort((a, b) => b.weight - a.weight);
}

/**
 * The same findings as a block for her context. Capped, because the point is
 * to give her something to have an opinion about, not to hand her a report to
 * read back.
 */
export function insightBrief(state: GameState, now: Date = new Date()): string {
  const insights = computeInsights(state, now).slice(0, 5);
  if (insights.length === 0) return "";
  const lines = insights.map((i) => `- ${i.detail}`).join("\n");
  return `WHAT THE RECORD ACTUALLY SHOWS (worked out from their save, so it is accurate; do not recite it, form a view)\n${lines}`;
}

/** A day's real numbers, for pinning a diary page to what happened. */
export function dayFacts(
  state: GameState,
  date: string,
): { completed: number; xp: number } | null {
  const record = state.history.find((d) => d.date === date);
  if (!record) return date <= todayStr() ? { completed: 0, xp: 0 } : null;
  return { completed: record.completed, xp: record.xp };
}
