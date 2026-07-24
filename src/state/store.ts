import { create } from "zustand";
import { applyDamage, applyGain, reviveIfDead, spendGold } from "./scoring";
import { runCron, todayStr } from "./cron";
import type {
  Bond,
  Character,
  Daily,
  Difficulty,
  GameState,
  Habit,
  Memory,
  Reward,
  Settings,
  Stats,
  Task,
  TaskType,
  Todo,
} from "./types";

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

export function freshCharacter(name = "Adventurer"): Character {
  return {
    name,
    level: 1,
    hp: 50,
    maxHp: 50,
    xp: 0,
    gold: 0,
  };
}

export function freshStats(): Stats {
  return {
    tasksCompleted: 0,
    totalXp: 0,
    currentStreak: 0,
    longestStreak: 0,
    timesFallen: 0,
  };
}

export function freshBond(): Bond {
  return { firstMet: nowIso(), interactions: 0 };
}

export function freshState(name?: string): GameState {
  return {
    character: freshCharacter(name),
    tasks: [],
    stats: freshStats(),
    memories: [],
    bond: freshBond(),
    createdAt: nowIso(),
    lastCron: todayStr(),
  };
}

/** Ensure a loaded/older save has all required fields (forward migration). */
export function normalizeState(state: GameState): GameState {
  return {
    ...state,
    stats: { ...freshStats(), ...(state.stats ?? {}) },
    memories: Array.isArray(state.memories) ? state.memories : [],
    bond: {
      firstMet: state.bond?.firstMet ?? state.createdAt ?? nowIso(),
      interactions: state.bond?.interactions ?? 0,
    },
  };
}

export interface Toast {
  id: string;
  text: string;
  kind: "gain" | "loss" | "level" | "info";
}

export type Tab = "dailies" | "habits" | "todos" | "rewards";

interface UIState {
  activeTab: Tab;
  chatOpen: boolean;
  settingsOpen: boolean;
  statsOpen: boolean;
  addOpen: TaskType | null;
  editing: Task | null;
  toasts: Toast[];
  celebrateLevel: number | null;
  fallen: number | null;
}

interface StoreState extends UIState {
  ready: boolean;
  state: GameState;
  settings: Settings;
  fileName: string | null;
  fileSupported: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error" | "needs-permission";

  // lifecycle
  hydrate: (state: GameState, settings: Settings) => void;
  replaceState: (state: GameState) => void;
  setReady: (v: boolean) => void;
  setFileName: (name: string | null) => void;
  setFileSupported: (v: boolean) => void;
  setSaveStatus: (s: StoreState["saveStatus"]) => void;

  // ui
  setTab: (t: Tab) => void;
  setChatOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setStatsOpen: (v: boolean) => void;
  setAddOpen: (t: TaskType | null) => void;
  setEditing: (t: Task | null) => void;
  pushToast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
  clearCelebrate: () => void;
  clearFallen: () => void;

  // settings
  setSettings: (patch: Partial<Settings>) => void;

  // tasks
  addTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  scoreHabit: (id: string, dir: "up" | "down") => void;
  toggleDaily: (id: string) => void;
  toggleTodo: (id: string) => void;
  buyReward: (id: string) => void;
  toggleChecklistItem: (taskId: string, itemId: string) => void;

  // cron
  runCronNow: () => void;

  // character
  renameCharacter: (name: string) => void;

  // memories
  addMemory: (
    text: string,
    category?: string,
    importance?: number,
  ) => Memory | null;
  updateMemory: (id: string, patch: Partial<Omit<Memory, "id" | "createdAt">>) => void;
  deleteMemory: (id: string) => void;

  // bond
  recordInteraction: () => void;
}

export interface NewTaskInput {
  type: TaskType;
  title: string;
  notes?: string;
  difficulty?: Difficulty;
  // habit
  positive?: boolean;
  negative?: boolean;
  // daily
  repeatDays?: number[];
  // todo
  dueDate?: string;
  // reward
  cost?: number;
  checklist?: string[];
  tags?: string[];
}

function buildTask(input: NewTaskInput): Task {
  const base = {
    id: uid(),
    title: input.title.trim() || "Untitled",
    notes: input.notes?.trim() || undefined,
    difficulty: input.difficulty ?? "easy",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    tags: input.tags,
  };
  const checklist = (input.checklist ?? []).map((text) => ({
    id: uid(),
    text,
    done: false,
  }));

  switch (input.type) {
    case "habit":
      return {
        ...base,
        type: "habit",
        positive: input.positive ?? true,
        negative: input.negative ?? true,
        value: 0,
        countUp: 0,
        countDown: 0,
      } as Habit;
    case "daily":
      return {
        ...base,
        type: "daily",
        done: false,
        streak: 0,
        repeatDays: input.repeatDays ?? [0, 1, 2, 3, 4, 5, 6],
        checklist,
      } as Daily;
    case "todo":
      return {
        ...base,
        type: "todo",
        done: false,
        dueDate: input.dueDate,
        checklist,
      } as Todo;
    case "reward":
      return {
        ...base,
        type: "reward",
        cost: input.cost ?? 10,
      } as Reward;
  }
}

const defaultSettings: Settings = {
  apiKey: "",
  model: "mistral-small-latest",
  proxyUrl: "",
  checkInsEnabled: false,
  checkInTimes: ["09:00", "20:00"],
  pushUrl: "",
};

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  state: freshState(),
  settings: defaultSettings,
  fileName: null,
  fileSupported: false,
  saveStatus: "idle",

  activeTab: "dailies",
  chatOpen: false,
  settingsOpen: false,
  statsOpen: false,
  addOpen: null,
  editing: null,
  toasts: [],
  celebrateLevel: null,
  fallen: null,

  hydrate: (state, settings) => set({ state, settings, ready: true }),
  replaceState: (state) => set({ state }),
  setReady: (v) => set({ ready: v }),
  setFileName: (name) => set({ fileName: name }),
  setFileSupported: (v) => set({ fileSupported: v }),
  setSaveStatus: (s) => set({ saveStatus: s }),

  setTab: (t) => set({ activeTab: t }),
  setChatOpen: (v) => set({ chatOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setStatsOpen: (v) => set({ statsOpen: v }),
  setAddOpen: (t) => set({ addOpen: t }),
  setEditing: (t) => set({ editing: t }),
  pushToast: (text, kind = "info") => {
    const toast: Toast = { id: uid(), text, kind };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    setTimeout(() => get().dismissToast(toast.id), 3600);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearCelebrate: () => set({ celebrateLevel: null }),
  clearFallen: () => set({ fallen: null }),

  setSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),

  addTask: (input) => {
    const task = buildTask(input);
    set((s) => ({ state: { ...s.state, tasks: [task, ...s.state.tasks] } }));
    return task;
  },

  updateTask: (id, patch) =>
    set((s) => ({
      state: {
        ...s.state,
        tasks: s.state.tasks.map((t) =>
          t.id === id ? ({ ...t, ...patch, updatedAt: nowIso() } as Task) : t,
        ),
      },
    })),

  deleteTask: (id) =>
    set((s) => ({
      state: { ...s.state, tasks: s.state.tasks.filter((t) => t.id !== id) },
    })),

  scoreHabit: (id, dir) => {
    const s = get();
    const task = s.state.tasks.find((t) => t.id === id);
    if (!task || task.type !== "habit") return;
    const habit = task as Habit;

    if (dir === "up") {
      const res = applyGain(s.state.character, habit.difficulty);
      s.pushToast(`+${res.xpGained} XP, +${res.goldGained} gold`, "gain");
      if (res.leveledUp) {
        set({ celebrateLevel: res.character.level });
        s.pushToast(`Level ${res.character.level}!`, "level");
      }
      set((st) => ({
        state: {
          ...st.state,
          character: res.character,
          stats: {
            ...st.state.stats,
            totalXp: st.state.stats.totalXp + res.xpGained,
          },
          tasks: st.state.tasks.map((t) =>
            t.id === id
              ? ({ ...habit, value: habit.value + 1, countUp: habit.countUp + 1 })
              : t,
          ),
        },
      }));
    } else {
      const dmg = applyDamage(s.state.character, habit.difficulty);
      s.pushToast(`-${dmg.hpLost} HP`, "loss");
      const rev = reviveIfDead(dmg.character);
      if (rev.died) {
        set({ fallen: rev.character.level });
        s.pushToast("You fell. Lost a level and some gold.", "loss");
      }
      set((st) => ({
        state: {
          ...st.state,
          character: rev.character,
          stats: rev.died
            ? {
                ...st.state.stats,
                timesFallen: st.state.stats.timesFallen + 1,
                currentStreak: 0,
              }
            : st.state.stats,
          tasks: st.state.tasks.map((t) =>
            t.id === id
              ? ({
                  ...habit,
                  value: habit.value - 1,
                  countDown: habit.countDown + 1,
                })
              : t,
          ),
        },
      }));
    }
  },

  toggleDaily: (id) => {
    const s = get();
    const task = s.state.tasks.find((t) => t.id === id);
    if (!task || task.type !== "daily") return;
    const daily = task as Daily;
    const willComplete = !daily.done;

    let character = s.state.character;
    let xpGained = 0;
    if (willComplete) {
      const res = applyGain(character, daily.difficulty);
      character = res.character;
      xpGained = res.xpGained;
      s.pushToast(`+${res.xpGained} XP, +${res.goldGained} gold`, "gain");
      if (res.leveledUp) {
        set({ celebrateLevel: res.character.level });
        s.pushToast(`Level ${res.character.level}!`, "level");
      }
    }

    set((st) => ({
      state: {
        ...st.state,
        character,
        stats: {
          ...st.state.stats,
          totalXp: st.state.stats.totalXp + xpGained,
          tasksCompleted: Math.max(
            0,
            st.state.stats.tasksCompleted + (willComplete ? 1 : -1),
          ),
        },
        tasks: st.state.tasks.map((t) =>
          t.id === id
            ? ({
                ...daily,
                done: willComplete,
                streak: willComplete
                  ? daily.streak + 1
                  : Math.max(0, daily.streak - 1),
                lastCompletedOn: willComplete ? todayStr() : daily.lastCompletedOn,
              })
            : t,
        ),
      },
    }));
  },

  toggleTodo: (id) => {
    const s = get();
    const task = s.state.tasks.find((t) => t.id === id);
    if (!task || task.type !== "todo") return;
    const todo = task as Todo;
    const willComplete = !todo.done;

    let character = s.state.character;
    let xpGained = 0;
    if (willComplete) {
      const res = applyGain(character, todo.difficulty);
      character = res.character;
      xpGained = res.xpGained;
      s.pushToast(`+${res.xpGained} XP, +${res.goldGained} gold`, "gain");
      if (res.leveledUp) {
        set({ celebrateLevel: res.character.level });
        s.pushToast(`Level ${res.character.level}!`, "level");
      }
    }

    set((st) => ({
      state: {
        ...st.state,
        character,
        stats: {
          ...st.state.stats,
          totalXp: st.state.stats.totalXp + xpGained,
          tasksCompleted: Math.max(
            0,
            st.state.stats.tasksCompleted + (willComplete ? 1 : -1),
          ),
        },
        tasks: st.state.tasks.map((t) =>
          t.id === id
            ? ({
                ...todo,
                done: willComplete,
                completedAt: willComplete ? nowIso() : undefined,
              })
            : t,
        ),
      },
    }));
  },

  buyReward: (id) => {
    const s = get();
    const task = s.state.tasks.find((t) => t.id === id);
    if (!task || task.type !== "reward") return;
    const reward = task as Reward;
    const next = spendGold(s.state.character, reward.cost);
    if (!next) {
      s.pushToast("Not enough gold for that yet", "info");
      return;
    }
    set((st) => ({ state: { ...st.state, character: next } }));
    s.pushToast(`Bought ${reward.title} (-${reward.cost} gold)`, "info");
  },

  toggleChecklistItem: (taskId, itemId) =>
    set((s) => ({
      state: {
        ...s.state,
        tasks: s.state.tasks.map((t) => {
          if (t.id !== taskId) return t;
          if (t.type !== "daily" && t.type !== "todo") return t;
          const withList = t as Daily | Todo;
          return {
            ...withList,
            checklist: withList.checklist.map((c) =>
              c.id === itemId ? { ...c, done: !c.done } : c,
            ),
          } as Task;
        }),
      },
    })),

  runCronNow: () => {
    const s = get();
    const { state, summary } = runCron(s.state);
    if (!summary.ran) return;

    // Update the day-streak based on yesterday's performance.
    let stats = state.stats;
    if (summary.hadActive) {
      const currentStreak = summary.allDone ? stats.currentStreak + 1 : 0;
      stats = {
        ...stats,
        currentStreak,
        longestStreak: Math.max(stats.longestStreak, currentStreak),
      };
    }

    // If the accumulated daily damage was fatal, the adventurer falls.
    const rev = reviveIfDead(state.character);
    if (rev.died) {
      stats = { ...stats, timesFallen: stats.timesFallen + 1, currentStreak: 0 };
      set({ fallen: rev.character.level });
    }

    set({ state: { ...state, character: rev.character, stats } });

    if (rev.died) {
      s.pushToast("You fell overnight. Lost a level and some gold.", "loss");
    } else if (summary.missed > 0) {
      s.pushToast(
        `A new day. ${summary.missed} missed ${
          summary.missed === 1 ? "daily" : "dailies"
        } cost ${summary.hpLost} HP.`,
        "loss",
      );
    } else {
      s.pushToast("A fresh day. Dailies reset.", "info");
    }
  },

  renameCharacter: (name) =>
    set((s) => ({
      state: { ...s.state, character: { ...s.state.character, name } },
    })),

  addMemory: (text, category, importance) => {
    const clean = text.trim();
    if (!clean) return null;
    const existing = get().state.memories;
    // Skip near-duplicates (case-insensitive exact match).
    const dup = existing.find(
      (m) => m.text.trim().toLowerCase() === clean.toLowerCase(),
    );
    if (dup) return dup;
    const memory: Memory = {
      id: uid(),
      text: clean,
      category: category?.trim() || undefined,
      importance:
        typeof importance === "number"
          ? Math.max(1, Math.min(3, Math.round(importance)))
          : 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    set((s) => ({
      state: { ...s.state, memories: [memory, ...s.state.memories] },
    }));
    return memory;
  },

  updateMemory: (id, patch) =>
    set((s) => ({
      state: {
        ...s.state,
        memories: s.state.memories.map((m) =>
          m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m,
        ),
      },
    })),

  deleteMemory: (id) =>
    set((s) => ({
      state: {
        ...s.state,
        memories: s.state.memories.filter((m) => m.id !== id),
      },
    })),

  recordInteraction: () =>
    set((s) => ({
      state: {
        ...s.state,
        bond: {
          ...s.state.bond,
          interactions: s.state.bond.interactions + 1,
        },
      },
    })),
}));
