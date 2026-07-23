export type TaskType = "habit" | "daily" | "todo" | "reward";

export type Difficulty = "trivial" | "easy" | "medium" | "hard";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface BaseTask {
  id: string;
  type: TaskType;
  title: string;
  notes?: string;
  difficulty: Difficulty;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

export interface Habit extends BaseTask {
  type: "habit";
  positive: boolean;
  negative: boolean;
  /** rolling strength value, drives the color coding */
  value: number;
  countUp: number;
  countDown: number;
}

export interface Daily extends BaseTask {
  type: "daily";
  done: boolean;
  streak: number;
  /** weekday indices (0=Sun..6=Sat) on which this daily is active */
  repeatDays: number[];
  checklist: ChecklistItem[];
  /** ISO date (yyyy-mm-dd) the daily was last completed */
  lastCompletedOn?: string;
}

export interface Todo extends BaseTask {
  type: "todo";
  done: boolean;
  dueDate?: string;
  checklist: ChecklistItem[];
  completedAt?: string;
}

export interface Reward extends BaseTask {
  type: "reward";
  cost: number;
}

export type Task = Habit | Daily | Todo | Reward;

export interface Character {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  xp: number;
  gold: number;
}

export interface Stats {
  /** dailies + to-dos ever completed */
  tasksCompleted: number;
  /** cumulative XP ever earned */
  totalXp: number;
  /** consecutive days all active dailies were cleared */
  currentStreak: number;
  longestStreak: number;
  /** times HP hit zero */
  timesFallen: number;
}

export interface GameState {
  character: Character;
  tasks: Task[];
  stats: Stats;
  /** ISO date (yyyy-mm-dd) that cron last ran */
  lastCron?: string;
  createdAt: string;
}

export interface Settings {
  apiKey: string;
  model: string;
  proxyUrl: string;
}

/** The full persisted payload that lives inside the .rpgsave file. */
export interface SaveEnvelope {
  magic: "RPGTASK";
  version: number;
  savedAt: string;
  state: GameState;
}

export const SAVE_VERSION = 1;
export const SAVE_MAGIC = "RPGTASK" as const;
