import { isDailyActiveOn, todayStr } from "../state/cron";
import type { Daily, GameState, Habit, Todo } from "../state/types";

/** A soft, optional suggestion Leela can raise once (never as a lecture). */
export interface SoftPrediction {
  id: string;
  /** short note for Leela's private context */
  note: string;
}

/**
 * Look at the board for patterns worth one gentle proposal. Prefer signal over
 * volume: at most three, ranked by how actionable they are.
 */
export function softPredictions(state: GameState, now: Date = new Date()): SoftPrediction[] {
  const out: SoftPrediction[] = [];
  const today = todayStr(now);
  const weekday = now.getDay();
  const dailies = state.tasks.filter((t) => t.type === "daily") as Daily[];
  const habits = state.tasks.filter((t) => t.type === "habit") as Habit[];
  const todos = state.tasks.filter((t) => t.type === "todo") as Todo[];
  const active = dailies.filter((d) => isDailyActiveOn(d, now));

  // Overloaded board: too many active dailies today.
  if (active.length >= 8) {
    out.push({
      id: "overload",
      note: `They have ${active.length} dailies active today. Offer to park or thin one or two, not all of them.`,
    });
  }

  // Broken streaks that are still scheduled today.
  const broken = active.filter((d) => !d.done && d.streak === 0);
  if (broken.length > 0 && broken.length <= 3) {
    const sample = broken[0];
    out.push({
      id: `streak-${sample.id}`,
      note: `"${sample.title}" has no streak and is still open. Offer to ease its repeatDays or lower difficulty — ask first, then update_task if they agree.`,
    });
  } else if (broken.length > 3) {
    out.push({
      id: "streak-many",
      note: `${broken.length} dailies have lost their streak. Suggest picking one to protect and temporarily parking the rest.`,
    });
  }

  // Habits trending the wrong way.
  const bad = habits
    .filter((h) => h.countDown > h.countUp && h.countDown >= 3)
    .sort((a, b) => b.countDown - a.countDown);
  if (bad[0]) {
    out.push({
      id: `habit-${bad[0].id}`,
      note: `"${bad[0].title}" is sliding (+${bad[0].countUp}/-${bad[0].countDown}). Softly ask whether to keep, reframe, or retire it.`,
    });
  }

  // Overdue to-dos.
  const overdue = todos.filter((t) => !t.done && t.dueDate && t.dueDate < today);
  if (overdue.length === 1) {
    out.push({
      id: `todo-${overdue[0].id}`,
      note: `"${overdue[0].title}" is overdue. Offer to reschedule the dueDate or break it into a checklist.`,
    });
  } else if (overdue.length > 1) {
    out.push({
      id: "todo-many",
      note: `${overdue.length} to-dos are overdue. Offer to triage: keep one, push the rest.`,
    });
  }

  // Weekend / weekday mismatch: dailies active today that only run on this weekday and keep failing (streak 0).
  const dayOnly = active.filter(
    (d) =>
      !d.done &&
      d.streak === 0 &&
      d.repeatDays?.length > 0 &&
      d.repeatDays.length <= 2 &&
      d.repeatDays.includes(weekday),
  );
  if (dayOnly[0] && !out.some((p) => p.id === `streak-${dayOnly[0].id}`)) {
    out.push({
      id: `dayfit-${dayOnly[0].id}`,
      note: `"${dayOnly[0].title}" only runs on days like today and keeps slipping. Offer to move it to a better weekday.`,
    });
  }

  // Empty board after they've been around a bit.
  if (
    state.tasks.length === 0 &&
    (state.bond?.interactions ?? 0) >= 2
  ) {
    out.push({
      id: "empty",
      note: "Board is empty. Gently pull one small quest out of them instead of dumping a routine.",
    });
  }

  return out.slice(0, 3);
}
