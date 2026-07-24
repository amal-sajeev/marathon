import type { GameState } from "../state/types";

export interface Achievement {
  id: string;
  label: string;
  desc: string;
  unlocked: boolean;
  /** progress toward the goal, 0..1, for locked ones */
  progress: number;
}

interface Def {
  id: string;
  label: string;
  desc: string;
  /** returns [current, target] */
  measure: (s: GameState) => [number, number];
}

const DEFS: Def[] = [
  {
    id: "first-mission",
    label: "First Steps",
    desc: "Complete your first mission.",
    measure: (s) => [s.stats.tasksCompleted, 1],
  },
  {
    id: "ten-missions",
    label: "Getting Traction",
    desc: "Complete 10 missions.",
    measure: (s) => [s.stats.tasksCompleted, 10],
  },
  {
    id: "hundred-missions",
    label: "Centurion",
    desc: "Complete 100 missions.",
    measure: (s) => [s.stats.tasksCompleted, 100],
  },
  {
    id: "streak-7",
    label: "Consistent",
    desc: "Reach a 7-day streak.",
    measure: (s) => [s.stats.longestStreak, 7],
  },
  {
    id: "streak-30",
    label: "Unbreakable",
    desc: "Reach a 30-day streak.",
    measure: (s) => [s.stats.longestStreak, 30],
  },
  {
    id: "level-5",
    label: "Enlisted",
    desc: "Reach level 5.",
    measure: (s) => [s.character.level, 5],
  },
  {
    id: "level-15",
    label: "Seasoned",
    desc: "Reach level 15.",
    measure: (s) => [s.character.level, 15],
  },
  {
    id: "habits-50",
    label: "Force of Habit",
    desc: "Score habits 50 times.",
    measure: (s) => [s.stats.habitsScored, 50],
  },
  {
    id: "xp-5000",
    label: "Veteran",
    desc: "Earn 5,000 total XP.",
    measure: (s) => [s.stats.totalXp, 5000],
  },
  {
    id: "login-7",
    label: "Regular",
    desc: "Open Marathon 7 days running.",
    measure: (s) => [s.engagement?.loginStreak ?? 0, 7],
  },
];

export function computeAchievements(s: GameState): Achievement[] {
  return DEFS.map((d) => {
    const [cur, target] = d.measure(s);
    return {
      id: d.id,
      label: d.label,
      desc: d.desc,
      unlocked: cur >= target,
      progress: Math.max(0, Math.min(1, target > 0 ? cur / target : 0)),
    };
  });
}
