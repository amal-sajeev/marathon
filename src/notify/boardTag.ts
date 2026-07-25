import { daysSince, isDailyActiveOn, shiftDays, todayStr } from "../state/cron";
import type { Daily, GameState, Todo } from "../state/types";

/**
 * A single coarse word for what the board looks like, sent to the push Worker
 * so a notification can at least be about the right situation.
 *
 * This is the only thing about the user's tasks that ever leaves the device, so
 * it stays an enum: no titles, no counts, no dates. "missed-checkin" isn't
 * derived from the board; it's set when a check-in window passes unanswered.
 */
export type BoardTag =
  | "overdue"
  | "quiet"
  | "streak-risk"
  | "all-clear"
  | "comeback"
  | "missed-checkin";

export function computeBoardTag(state: GameState, now: Date = new Date()): BoardTag | null {
  const today = todayStr(now);
  const dailies = state.tasks.filter((t) => t.type === "daily") as Daily[];
  const todos = state.tasks.filter((t) => t.type === "todo") as Todo[];
  const active = dailies.filter((d) => isDailyActiveOn(d, now));
  const openDailies = active.filter((d) => !d.done);
  const overdue = todos.filter((t) => !t.done && t.dueDate && t.dueDate < today);

  if (active.length > 0 && openDailies.length === 0 && overdue.length === 0) {
    return "all-clear";
  }
  if (overdue.length > 0) return "overdue";
  if (state.stats.currentStreak >= 3 && openDailies.length > 0) return "streak-risk";

  const history = state.history ?? [];
  const completedOn = (offset: number) =>
    history.find((d) => d.date === shiftDays(now, offset))?.completed ?? 0;
  const quietBefore = [1, 2, 3].every((k) => completedOn(-k) === 0);
  const hadEarlier = history.some((d) => daysSince(d.date, now) >= 4);
  if (completedOn(0) > 0 && quietBefore && hadEarlier) return "comeback";

  if (state.tasks.length === 0 || (openDailies.length === 0 && completedOn(0) === 0)) {
    return "quiet";
  }
  return null;
}
