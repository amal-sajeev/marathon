import { daysSince, isDailyActiveOn, shiftDays, todayStr } from "../state/cron";
import type { Daily, GameState, Habit, Todo } from "../state/types";

/** A soft, optional suggestion Leela can raise once (never as a lecture). */
export interface SoftPrediction {
  id: string;
  /** short note for Leela's private context */
  note: string;
  /**
   * Whether this points at something going well or something slipping. Used to
   * stop her proactive voice from only ever showing up when there's a problem.
   */
  tone: "gain" | "deficit";
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

  // History only gets a row on days something was actually completed, so gaps
  // are missing dates rather than zero rows. Everything below works off the
  // calendar, not off row indices.
  const history = state.history ?? [];
  const byDate = new Map(history.map((d) => [d.date, d.completed]));
  const completedOn = (offset: number) => byDate.get(shiftDays(now, offset)) ?? 0;

  // Overloaded board: too many active dailies today.
  if (active.length >= 8) {
    out.push({
      id: "overload",
      tone: "deficit",
      note: `They have ${active.length} dailies active today. Offer to park or thin one or two, not all of them.`,
    });
  }

  // Broken streaks that are still scheduled today.
  const broken = active.filter((d) => !d.done && d.streak === 0);
  if (broken.length > 0 && broken.length <= 3) {
    const sample = broken[0];
    out.push({
      id: `streak-${sample.id}`,
      tone: "deficit",
      note: `"${sample.title}" has no streak and is still open. Offer to ease its repeatDays or lower difficulty — ask first, then update_task if they agree.`,
    });
  } else if (broken.length > 3) {
    out.push({
      id: "streak-many",
      tone: "deficit",
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
      tone: "deficit",
      note: `"${bad[0].title}" is sliding (+${bad[0].countUp}/-${bad[0].countDown}). Softly ask whether to keep, reframe, or retire it.`,
    });
  }

  // Overdue to-dos.
  const overdue = todos.filter((t) => !t.done && t.dueDate && t.dueDate < today);
  if (overdue.length === 1) {
    out.push({
      id: `todo-${overdue[0].id}`,
      tone: "deficit",
      note: `"${overdue[0].title}" is overdue. Offer to reschedule the dueDate or break it into a checklist.`,
    });
  } else if (overdue.length > 1) {
    out.push({
      id: "todo-many",
      tone: "deficit",
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
      tone: "deficit",
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
      tone: "deficit",
      note: "Board is empty. Gently pull one small quest out of them instead of dumping a routine.",
    });
  }

  // --- Gain-framed. Without these she only ever speaks up when something's wrong. ---

  // A streak milestone lands tomorrow if they clear today.
  const streak = state.stats.currentStreak;
  if (streak === 6 || streak === 13 || streak === 29) {
    out.push({
      id: "streak-approaching",
      tone: "gain",
      note: `They're on a ${streak}-day streak, so clearing today makes it ${streak + 1}. Mention it once as something in reach. Do not frame it as something they'd be losing.`,
    });
  }

  // Best seven days they've had, measured against every earlier window.
  const oldest = history[0]?.date;
  const span = oldest ? daysSince(oldest, now) : 0;
  if (span >= 13) {
    const windowSum = (endOffset: number) => {
      let n = 0;
      for (let i = 0; i < 7; i++) n += completedOn(endOffset - i);
      return n;
    };
    const thisWeek = windowSum(0);
    let bestPrior = 0;
    for (let off = -7; off >= -(span - 6); off--) {
      bestPrior = Math.max(bestPrior, windowSum(off));
    }
    if (thisWeek > bestPrior && thisWeek > 0) {
      out.push({
        id: "best-week",
        tone: "gain",
        note: `Their last seven days (${thisWeek} things finished) beat every earlier week they've had (previous best was ${bestPrior}). Say it once, plainly. Don't turn it into a lecture about keeping it up.`,
      });
    }
  }

  // Moving again after a real gap.
  const quietBefore = [1, 2, 3].every((k) => completedOn(-k) === 0);
  const hadEarlier = history.some((d) => daysSince(d.date, now) >= 4);
  if (completedOn(0) > 0 && quietBefore && hadEarlier) {
    out.push({
      id: "comeback",
      tone: "gain",
      note: "They've started moving again after about three quiet days. Acknowledge the restart warmly and do not ask where they went or bring up the gap as a failure.",
    });
  }

  // Whole board cleared with the day still ahead of them.
  if (active.length >= 2 && active.every((d) => d.done) && now.getHours() < 17) {
    out.push({
      id: "all-clear-early",
      tone: "gain",
      note: `All ${active.length} of today's dailies are already done and it isn't evening yet. Notice it. Offer the rest of the day off rather than proposing more work.`,
    });
  }

  // Lead with something going well when there is something going well, and let
  // deficits take at most two of the three slots.
  const gains = out.filter((p) => p.tone === "gain");
  const deficits = out.filter((p) => p.tone === "deficit");
  if (gains.length === 0) return deficits.slice(0, 3);
  return [gains[0], ...deficits.slice(0, 2), ...gains.slice(1)].slice(0, 3);
}
