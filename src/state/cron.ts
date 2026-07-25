import { applyDamage } from "./scoring";
import { MOOD_BASELINE } from "../game/mood";
import type { Daily, GameState, LeelaMood, Task } from "./types";

export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** yyyy-mm-dd for a day offset from a reference date. */
export function shiftDays(from: Date, delta: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + delta);
  return todayStr(d);
}

/** Whole days between a yyyy-mm-dd and the reference date. */
export function daysSince(date: string, now: Date = new Date()): number {
  const then = new Date(date + "T00:00:00").getTime();
  if (Number.isNaN(then)) return Number.MAX_SAFE_INTEGER;
  const ref = new Date(todayStr(now) + "T00:00:00").getTime();
  return Math.round((ref - then) / 86_400_000);
}

export function isDailyActiveOn(daily: Daily, d: Date): boolean {
  if (!daily.repeatDays || daily.repeatDays.length === 0) return true;
  return daily.repeatDays.includes(d.getDay());
}

export interface CronSummary {
  ran: boolean;
  missed: number;
  hpLost: number;
  daysPassed: number;
  /** whether there was at least one active daily yesterday */
  hadActive: boolean;
  /** whether every active daily yesterday was completed */
  allDone: boolean;
  /** titles of the dailies that were missed, for the opener and the diary */
  missedTitles: string[];
  /** of those, the ones Leela had suggested herself */
  missedSuggested: string[];
}

/**
 * Run the daily reset. If the calendar day changed since lastCron, any active,
 * uncompleted dailies deal damage and lose their streak; then all dailies reset
 * for the new day.
 */
export function runCron(state: GameState, now: Date = new Date()): {
  state: GameState;
  summary: CronSummary;
} {
  const today = todayStr(now);
  if (state.lastCron === today) {
    return {
      state,
      summary: {
        ran: false,
        missed: 0,
        hpLost: 0,
        daysPassed: 0,
        hadActive: false,
        allDone: false,
        missedTitles: [],
        missedSuggested: [],
      },
    };
  }

  let character = { ...state.character };
  let missed = 0;
  let hpLost = 0;
  let hadActive = false;
  let allDone = true;
  const missedTitles: string[] = [];
  const missedSuggested: string[] = [];

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const tasks: Task[] = state.tasks.map((t) => {
    if (t.type !== "daily") return t;
    const daily = t as Daily;
    const wasActive = isDailyActiveOn(daily, yesterday);
    if (wasActive) hadActive = true;

    if (wasActive && !daily.done) {
      missed += 1;
      allDone = false;
      missedTitles.push(daily.title);
      if (daily.suggestedByLeela) missedSuggested.push(daily.title);
      const res = applyDamage(character, daily.difficulty);
      character = res.character;
      hpLost += res.hpLost;
      return { ...daily, done: false, streak: 0 };
    }
    // reset for the new day; completed dailies keep their streak
    return { ...daily, done: false };
  });

  hpLost = Math.round(hpLost * 10) / 10;

  const leelaMood = settleMood(state.leelaMood, {
    today,
    now,
    hadActive,
    allDone,
    missedTitles,
    missedSuggested,
    tookDamage: hpLost > 0,
  });

  // A promise with a deadline that's passed is a promise that was broken.
  const bondRequests = state.bondRequests.map((r) =>
    r.status === "open" && r.goal.byDate && r.goal.byDate < today
      ? { ...r, status: "lapsed" as const }
      : r,
  );

  return {
    state: { ...state, character, tasks, leelaMood, bondRequests, lastCron: today },
    summary: {
      ran: true,
      missed,
      hpLost,
      daysPassed: state.lastCron ? 1 : 0,
      hadActive,
      allDone,
      missedTitles,
      missedSuggested,
    },
  };
}

/**
 * Fold the day that just ended into Leela's mood.
 *
 * Missing something she suggested costs more than missing something you set
 * yourself, because the first is a promise to her and the second is a promise
 * to you. The drift toward baseline on empty days is what stops the value
 * pinning at 0 and the whole mechanic going deaf.
 *
 * This always runs. Whether she is allowed to *show* it is decided elsewhere,
 * by negativeExpressionActive().
 */
function settleMood(
  prev: LeelaMood | undefined,
  ctx: {
    today: string;
    now: Date;
    hadActive: boolean;
    allDone: boolean;
    missedTitles: string[];
    missedSuggested: string[];
    tookDamage: boolean;
  },
): LeelaMood {
  const current = prev ?? { value: MOOD_BASELINE };
  if (current.lastSettled === ctx.today) return current;

  let value = current.value ?? MOOD_BASELINE;
  let reason = current.reason;
  let missedTask: string | undefined;
  let lockedEmotion: string | undefined;
  let lockedUntil: string | undefined;

  if (!ctx.hadActive) {
    // Nothing was asked of them, so nothing is held against them. Drift home.
    if (value < MOOD_BASELINE) value += 5;
    else if (value > MOOD_BASELINE) value -= 2;
    reason = undefined;
  } else if (ctx.allDone) {
    value += 15;
    reason = "They cleared everything yesterday.";
  } else {
    const ownMisses = ctx.missedTitles.length - ctx.missedSuggested.length;
    value += ctx.missedSuggested.length * -20 + ownMisses * -8;
    missedTask = ctx.missedSuggested[0];
    reason = missedTask
      ? `They didn't get to "${missedTask}", which you had suggested.`
      : `They missed ${ctx.missedTitles.length} of yesterday's dailies.`;
    // The resting face stays fallen for the rest of today, not just one message.
    lockedEmotion = "sad";
    lockedUntil = endOfDayIso(ctx.now);
  }

  return {
    value: Math.max(0, Math.min(100, Math.round(value))),
    lastSettled: ctx.today,
    reason,
    missedTask,
    lockedEmotion,
    lockedUntil,
    // A new day gets a fresh chance for the opener to land once.
    ackDate: undefined,
    reliefPending: false,
    damageAt: ctx.tookDamage ? ctx.now.toISOString() : current.damageAt,
  };
}

function endOfDayIso(now: Date): string {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}
