import type { BondRequest, GameState } from "../state/types";

export interface RequestProgress {
  current: number;
  target: number;
  met: boolean;
}

/**
 * How far along one of her requests is.
 *
 * Checked against real state rather than taken on her word, because a model
 * asked whether a promise was kept will usually say yes. If the number isn't
 * there, the tool refuses and she has to keep waiting like everyone else.
 */
export function requestProgress(state: GameState, req: BondRequest): RequestProgress {
  const target = req.goal.target;
  if (req.goal.kind === "streak") {
    const current = state.stats.currentStreak;
    return { current, target, met: current >= target };
  }

  // Everything finished since she asked, habits included.
  const from = req.createdAt.slice(0, 10);
  const current = state.history
    .filter((d) => d.date >= from)
    .reduce((n, d) => n + Math.max(0, d.completed), 0);
  return { current, target, met: current >= target };
}

export function describeGoal(req: BondRequest): string {
  const { kind, target, byDate } = req.goal;
  const what =
    kind === "streak"
      ? `a ${target}-day streak`
      : `${target} things finished since you asked`;
  return byDate ? `${what}, by ${byDate}` : what;
}

export function openRequest(state: GameState): BondRequest | undefined {
  return state.bondRequests.find((r) => r.status === "open");
}
