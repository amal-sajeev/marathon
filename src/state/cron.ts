import { applyDamage } from "./scoring";
import type { Daily, GameState, Task } from "./types";

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
      },
    };
  }

  let character = { ...state.character };
  let missed = 0;
  let hpLost = 0;
  let hadActive = false;
  let allDone = true;

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
      const res = applyDamage(character, daily.difficulty);
      character = res.character;
      hpLost += res.hpLost;
      return { ...daily, done: false, streak: 0 };
    }
    // reset for the new day; completed dailies keep their streak
    return { ...daily, done: false };
  });

  hpLost = Math.round(hpLost * 10) / 10;

  return {
    state: { ...state, character, tasks, lastCron: today },
    summary: {
      ran: true,
      missed,
      hpLost,
      daysPassed: state.lastCron ? 1 : 0,
      hadActive,
      allDone,
    },
  };
}
