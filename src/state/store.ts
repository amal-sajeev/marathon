import { create } from "zustand";
import { applyDamage, applyGain, reviveIfDead, spendGold } from "./scoring";
import { runCron, todayStr } from "./cron";
import type {
  Bond,
  Character,
  Cosmetics,
  Daily,
  DayRecord,
  Difficulty,
  Followup,
  GameState,
  Habit,
  Keepsake,
  Memory,
  MoodEntry,
  Reward,
  Settings,
  Signature,
  Stats,
  Task,
  TaskType,
  Todo,
} from "./types";
import { CONSUMABLES, cosmeticById } from "../game/cosmetics";
import { BOND_STAGES } from "../game/bond";

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
    inventory: { hpPotion: 0, xpCharm: 0, streakShield: 0 },
    buffs: {},
  };
}

export function freshStats(): Stats {
  return {
    tasksCompleted: 0,
    totalXp: 0,
    currentStreak: 0,
    longestStreak: 0,
    timesFallen: 0,
    habitsScored: 0,
  };
}

export function freshBond(): Bond {
  return { firstMet: nowIso(), interactions: 0, lastStageIndex: 0 };
}

export function freshSignature(): Signature {
  return { nicknames: {}, bits: [] };
}

export function freshCosmetics(): Cosmetics {
  return { accent: "", orbSkin: "", badgeFrame: "", owned: [] };
}

export function freshState(name?: string): GameState {
  return {
    saveId: uid(),
    character: freshCharacter(name),
    tasks: [],
    stats: freshStats(),
    memories: [],
    bond: freshBond(),
    moods: [],
    history: [],
    cosmetics: freshCosmetics(),
    followups: [],
    engagement: { loginStreak: 0 },
    signature: freshSignature(),
    keepsakes: [],
    createdAt: nowIso(),
    lastCron: todayStr(),
    updatedAt: nowIso(),
  };
}

/**
 * Identity of a save, tolerant of older files written before saveId existed.
 * Falls back to createdAt rather than a random value so the same file opened on
 * two devices agrees on its id, which conflict resolution depends on. Returns
 * "" when neither is present, which callers read as "unknown, don't compare".
 */
export function deriveSaveId(state: Partial<GameState> | undefined): string {
  return state?.saveId || state?.createdAt || "";
}

/** Ensure a loaded/older save has all required fields (forward migration). */
export function normalizeState(state: GameState): GameState {
  return {
    ...state,
    saveId: deriveSaveId(state) || uid(),
    character: {
      ...state.character,
      inventory: {
        hpPotion: state.character?.inventory?.hpPotion ?? 0,
        xpCharm: state.character?.inventory?.xpCharm ?? 0,
        streakShield: state.character?.inventory?.streakShield ?? 0,
      },
      buffs: state.character?.buffs ?? {},
    },
    stats: { ...freshStats(), ...(state.stats ?? {}) },
    memories: Array.isArray(state.memories) ? state.memories : [],
    bond: {
      firstMet: state.bond?.firstMet ?? state.createdAt ?? nowIso(),
      interactions: state.bond?.interactions ?? 0,
      lastStageIndex: state.bond?.lastStageIndex ?? 0,
      lastTalkedAt: state.bond?.lastTalkedAt,
    },
    moods: Array.isArray(state.moods) ? state.moods : [],
    history: Array.isArray(state.history) ? state.history : [],
    cosmetics: { ...freshCosmetics(), ...(state.cosmetics ?? {}) },
    followups: Array.isArray(state.followups) ? state.followups : [],
    engagement: {
      loginStreak: state.engagement?.loginStreak ?? 0,
      lastGiftDate: state.engagement?.lastGiftDate,
      lastLoginDate: state.engagement?.lastLoginDate,
      lastDebriefDate: state.engagement?.lastDebriefDate,
      lastSundayLetter: state.engagement?.lastSundayLetter,
    },
    signature: {
      ...freshSignature(),
      ...(state.signature ?? {}),
      nicknames: state.signature?.nicknames ?? {},
      bits: Array.isArray(state.signature?.bits) ? state.signature.bits : [],
    },
    keepsakes: Array.isArray(state.keepsakes) ? state.keepsakes : [],
    updatedAt: state.updatedAt ?? nowIso(),
  };
}

export interface Toast {
  id: string;
  text: string;
  kind: "gain" | "loss" | "level" | "info";
  /** show an Undo button that restores the pre-action snapshot */
  undo?: boolean;
}

export type Tab = "dailies" | "habits" | "todos" | "rewards";

interface UIState {
  activeTab: Tab;
  chatOpen: boolean;
  settingsOpen: boolean;
  statsOpen: boolean;
  suppliesOpen: boolean;
  wardrobeOpen: boolean;
  moodOpen: boolean;
  addOpen: TaskType | null;
  editing: Task | null;
  toasts: Toast[];
  celebrateLevel: number | null;
  fallen: number | null;
  /** the newly reached bond stage index, shown as a milestone overlay */
  bondMilestone: number | null;
  /** snapshot to restore when the user taps Undo */
  undo: { label: string; snapshot: GameState } | null;
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
  setSuppliesOpen: (v: boolean) => void;
  setWardrobeOpen: (v: boolean) => void;
  setMoodOpen: (v: boolean) => void;
  setAddOpen: (t: TaskType | null) => void;
  setEditing: (t: Task | null) => void;
  pushToast: (text: string, kind?: Toast["kind"], opts?: { undo?: boolean }) => void;
  dismissToast: (id: string) => void;
  clearCelebrate: () => void;
  clearFallen: () => void;
  clearBondMilestone: () => void;
  undoLast: () => void;

  // settings
  setSettings: (patch: Partial<Settings>) => void;

  // tasks
  addTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  moveTask: (id: string, dir: "up" | "down") => void;
  scoreHabit: (id: string, dir: "up" | "down") => void;
  toggleDaily: (id: string) => void;
  toggleTodo: (id: string) => void;
  buyReward: (id: string) => void;
  toggleChecklistItem: (taskId: string, itemId: string) => void;

  // consumables + cosmetics
  buyConsumable: (kind: "hpPotion" | "xpCharm" | "streakShield") => void;
  useHpPotion: () => void;
  useXpCharm: () => void;
  buyCosmetic: (id: string) => void;
  equipCosmetic: (id: string) => void;

  // mood
  addMood: (mood: number, note?: string) => void;

  // engagement
  registerLogin: () => void;
  claimDailyGift: () => { text: string } | null;
  addFollowup: (text: string, dueDate?: string) => Followup | null;
  completeFollowup: (id: string) => void;
  markDebriefDone: () => void;
  markSundayLetter: (date: string) => void;

  // signature + keepsakes (texture alongside the bond)
  setCodeword: (word: string | null) => void;
  setEnergyWord: (word: string | null) => void;
  setTaskNickname: (taskId: string, nickname: string | null) => void;
  addBit: (text: string) => void;
  removeBit: (text: string) => void;
  addKeepsake: (title: string, text: string, kind?: Keepsake["kind"]) => Keepsake | null;

  // cron
  runCronNow: () => void;

  // bond
  markBondStage: (index: number) => void;

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
  remindAt?: string;
}

/** Fold a day's activity into the rolling history, keeping the last ~150 days. */
function withDayLog(
  history: DayRecord[],
  completed: number,
  xp: number,
): DayRecord[] {
  const date = todayStr();
  const list = [...(history ?? [])];
  let i = list.findIndex((d) => d.date === date);
  if (i < 0) {
    list.push({ date, completed: 0, xp: 0 });
    i = list.length - 1;
  }
  list[i] = {
    date,
    completed: Math.max(0, list[i].completed + completed),
    xp: Math.max(0, list[i].xp + xp),
  };
  return list.slice(-150);
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
    remindAt: input.remindAt,
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
  weeklyReview: false,
  spontaneousEnabled: false,
  spontaneousCount: 2,
  spontaneousStart: "10:00",
  spontaneousEnd: "21:00",
  nightlyDebrief: true,
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
  suppliesOpen: false,
  wardrobeOpen: false,
  moodOpen: false,
  addOpen: null,
  editing: null,
  toasts: [],
  celebrateLevel: null,
  fallen: null,
  bondMilestone: null,
  undo: null,

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
  setSuppliesOpen: (v) => set({ suppliesOpen: v }),
  setWardrobeOpen: (v) => set({ wardrobeOpen: v }),
  setMoodOpen: (v) => set({ moodOpen: v }),
  setAddOpen: (t) => set({ addOpen: t }),
  setEditing: (t) => set({ editing: t }),
  pushToast: (text, kind = "info", opts) => {
    const toast: Toast = { id: uid(), text, kind, undo: opts?.undo };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    // Undo toasts linger a little longer so there's time to tap.
    setTimeout(() => get().dismissToast(toast.id), opts?.undo ? 6000 : 3600);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clearCelebrate: () => set({ celebrateLevel: null }),
  clearFallen: () => set({ fallen: null }),
  clearBondMilestone: () => set({ bondMilestone: null }),
  undoLast: () => {
    const { undo } = get();
    if (!undo) return;
    set({ state: undo.snapshot, undo: null });
    get().pushToast("Undone", "info");
  },

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

  deleteTask: (id) => {
    const s = get();
    const task = s.state.tasks.find((t) => t.id === id);
    const snapshot = s.state;
    set((st) => ({
      state: { ...st.state, tasks: st.state.tasks.filter((t) => t.id !== id) },
      undo: { label: "delete", snapshot },
    }));
    s.pushToast(task ? `Deleted "${task.title}"` : "Deleted", "info", { undo: true });
  },

  moveTask: (id, dir) =>
    set((s) => {
      const tasks = [...s.state.tasks];
      const from = tasks.findIndex((t) => t.id === id);
      if (from < 0) return {};
      const type = tasks[from].type;
      // find the neighbor of the same type in the requested direction
      const step = dir === "up" ? -1 : 1;
      let to = from + step;
      while (to >= 0 && to < tasks.length && tasks[to].type !== type) to += step;
      if (to < 0 || to >= tasks.length) return {};
      const [moved] = tasks.splice(from, 1);
      tasks.splice(to, 0, moved);
      return { state: { ...s.state, tasks } };
    }),

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
            habitsScored: st.state.stats.habitsScored + 1,
          },
          history: withDayLog(st.state.history, 1, res.xpGained),
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
    const snapshot = s.state;

    let character = s.state.character;
    let xpGained = 0;
    if (willComplete) {
      const res = applyGain(character, daily.difficulty);
      character = res.character;
      xpGained = res.xpGained;
      s.pushToast(`+${res.xpGained} XP, +${res.goldGained} gold`, "gain", {
        undo: true,
      });
      if (res.leveledUp) {
        set({ celebrateLevel: res.character.level });
        s.pushToast(`Level ${res.character.level}!`, "level");
      }
    }

    set((st) => ({
      undo: willComplete ? { label: "complete", snapshot } : st.undo,
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
        history: withDayLog(st.state.history, willComplete ? 1 : -1, xpGained),
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
    const snapshot = s.state;

    let character = s.state.character;
    let xpGained = 0;
    if (willComplete) {
      const res = applyGain(character, todo.difficulty);
      character = res.character;
      xpGained = res.xpGained;
      s.pushToast(`+${res.xpGained} XP, +${res.goldGained} gold`, "gain", {
        undo: true,
      });
      if (res.leveledUp) {
        set({ celebrateLevel: res.character.level });
        s.pushToast(`Level ${res.character.level}!`, "level");
      }
    }

    set((st) => ({
      undo: willComplete ? { label: "complete", snapshot } : st.undo,
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
        history: withDayLog(st.state.history, willComplete ? 1 : -1, xpGained),
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
    const snapshot = s.state;
    set((st) => ({
      state: { ...st.state, character: next },
      undo: { label: "buy", snapshot },
    }));
    s.pushToast(`Bought ${reward.title} (-${reward.cost} gold)`, "info", {
      undo: true,
    });
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

  buyConsumable: (kind) => {
    const s = get();
    const info = CONSUMABLES[kind];
    const next = spendGold(s.state.character, info.cost);
    if (!next) {
      s.pushToast("Not enough gold for that yet", "info");
      return;
    }
    set((st) => ({
      state: {
        ...st.state,
        character: {
          ...next,
          inventory: {
            ...st.state.character.inventory,
            [kind]: st.state.character.inventory[kind] + 1,
          },
        },
      },
    }));
    s.pushToast(`Bought a ${info.label} (-${info.cost} gold)`, "info");
  },

  useHpPotion: () => {
    const s = get();
    const c = s.state.character;
    if (c.inventory.hpPotion <= 0) {
      s.pushToast("No HP potions left", "info");
      return;
    }
    if (c.hp >= c.maxHp) {
      s.pushToast("Already at full HP", "info");
      return;
    }
    const restored = Math.round(c.maxHp * 0.4 * 10) / 10;
    const hp = Math.min(c.maxHp, Math.round((c.hp + restored) * 10) / 10);
    set((st) => ({
      state: {
        ...st.state,
        character: {
          ...st.state.character,
          hp,
          inventory: {
            ...st.state.character.inventory,
            hpPotion: st.state.character.inventory.hpPotion - 1,
          },
        },
      },
    }));
    s.pushToast(`+${Math.round(hp - c.hp)} HP`, "gain");
  },

  useXpCharm: () => {
    const s = get();
    const c = s.state.character;
    if (c.inventory.xpCharm <= 0) {
      s.pushToast("No XP charms left", "info");
      return;
    }
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    set((st) => ({
      state: {
        ...st.state,
        character: {
          ...st.state.character,
          buffs: { ...st.state.character.buffs, xpMultUntil: end.toISOString() },
          inventory: {
            ...st.state.character.inventory,
            xpCharm: st.state.character.inventory.xpCharm - 1,
          },
        },
      },
    }));
    s.pushToast("XP charm active: 1.5x XP until midnight", "gain");
  },

  buyCosmetic: (id) => {
    const s = get();
    const cosmetic = cosmeticById(id);
    if (!cosmetic) return;
    if (s.state.cosmetics.owned.includes(id) || cosmetic.cost === 0) return;
    const next = spendGold(s.state.character, cosmetic.cost);
    if (!next) {
      s.pushToast("Not enough gold for that yet", "info");
      return;
    }
    set((st) => ({
      state: {
        ...st.state,
        character: next,
        cosmetics: {
          ...st.state.cosmetics,
          owned: [...st.state.cosmetics.owned, id],
        },
      },
    }));
    s.pushToast(`Unlocked ${cosmetic.label}`, "info");
  },

  equipCosmetic: (id) => {
    const cosmetic = cosmeticById(id);
    if (!cosmetic) return;
    const s = get();
    const owned = cosmetic.cost === 0 || s.state.cosmetics.owned.includes(id);
    if (!owned) return;
    set((st) => ({
      state: {
        ...st.state,
        cosmetics: { ...st.state.cosmetics, [cosmetic.slot]: cosmetic.value },
      },
    }));
  },

  addMood: (mood, note) => {
    const clean = Math.max(1, Math.min(5, Math.round(mood)));
    const entry: MoodEntry = {
      id: uid(),
      date: todayStr(),
      mood: clean,
      note: note?.trim() || undefined,
      createdAt: nowIso(),
    };
    set((s) => ({
      state: { ...s.state, moods: [...s.state.moods.slice(-200), entry] },
    }));
  },

  registerLogin: () => {
    const today = todayStr();
    const s = get();
    const eng = s.state.engagement;
    if (eng.lastLoginDate === today) return;
    // Yesterday -> continue the streak; otherwise start over.
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = todayStr(y);
    const loginStreak = eng.lastLoginDate === yesterday ? eng.loginStreak + 1 : 1;
    set((st) => ({
      state: {
        ...st.state,
        engagement: { ...st.state.engagement, lastLoginDate: today, loginStreak },
      },
    }));
  },

  claimDailyGift: () => {
    const today = todayStr();
    const s = get();
    if (s.state.engagement.lastGiftDate === today) return null;

    const streak = Math.max(1, s.state.engagement.loginStreak);
    // Mostly gold that grows a little with the login streak; occasionally a
    // consumable so it feels like a real gift.
    const roll = Math.random();
    let text: string;
    let character = s.state.character;
    if (roll < 0.2) {
      character = {
        ...character,
        inventory: { ...character.inventory, hpPotion: character.inventory.hpPotion + 1 },
      };
      text = "an HP potion";
    } else if (roll < 0.32) {
      character = {
        ...character,
        inventory: { ...character.inventory, xpCharm: character.inventory.xpCharm + 1 },
      };
      text = "an XP charm";
    } else {
      const gold = 5 + Math.min(20, streak * 2);
      character = { ...character, gold: character.gold + gold };
      text = `${gold} gold`;
    }
    set((st) => ({
      state: {
        ...st.state,
        character,
        engagement: { ...st.state.engagement, lastGiftDate: today },
      },
    }));
    return { text };
  },

  addFollowup: (text, dueDate) => {
    const clean = text.trim();
    if (!clean) return null;
    const followup: Followup = {
      id: uid(),
      text: clean,
      dueDate: dueDate?.trim() || undefined,
      createdAt: nowIso(),
    };
    set((s) => ({
      state: { ...s.state, followups: [...s.state.followups.slice(-50), followup] },
    }));
    return followup;
  },

  completeFollowup: (id) =>
    set((s) => ({
      state: {
        ...s.state,
        followups: s.state.followups.map((f) =>
          f.id === id ? { ...f, done: true } : f,
        ),
      },
    })),

  markDebriefDone: () =>
    set((s) => ({
      state: {
        ...s.state,
        engagement: { ...s.state.engagement, lastDebriefDate: todayStr() },
      },
    })),

  markSundayLetter: (date) =>
    set((s) => ({
      state: {
        ...s.state,
        engagement: { ...s.state.engagement, lastSundayLetter: date },
      },
    })),

  setCodeword: (word) =>
    set((s) => ({
      state: {
        ...s.state,
        signature: {
          ...s.state.signature,
          codeword: word?.trim() || undefined,
        },
      },
    })),

  setEnergyWord: (word) =>
    set((s) => ({
      state: {
        ...s.state,
        signature: {
          ...s.state.signature,
          energyWord: word?.trim() || undefined,
        },
      },
    })),

  setTaskNickname: (taskId, nickname) =>
    set((s) => {
      const nicknames = { ...s.state.signature.nicknames };
      const clean = nickname?.trim();
      if (!clean) delete nicknames[taskId];
      else nicknames[taskId] = clean;
      return {
        state: {
          ...s.state,
          signature: { ...s.state.signature, nicknames },
        },
      };
    }),

  addBit: (text) => {
    const clean = text.trim();
    if (!clean) return;
    set((s) => {
      const bits = s.state.signature.bits;
      if (bits.some((b) => b.toLowerCase() === clean.toLowerCase())) return {};
      return {
        state: {
          ...s.state,
          signature: {
            ...s.state.signature,
            bits: [...bits, clean].slice(-30),
          },
        },
      };
    });
  },

  removeBit: (text) =>
    set((s) => ({
      state: {
        ...s.state,
        signature: {
          ...s.state.signature,
          bits: s.state.signature.bits.filter(
            (b) => b.toLowerCase() !== text.trim().toLowerCase(),
          ),
        },
      },
    })),

  addKeepsake: (title, text, kind = "other") => {
    const t = title.trim();
    const body = text.trim();
    if (!t || !body) return null;
    const keepsake: Keepsake = {
      id: uid(),
      kind,
      title: t,
      text: body,
      createdAt: nowIso(),
    };
    set((s) => ({
      state: {
        ...s.state,
        keepsakes: [keepsake, ...s.state.keepsakes].slice(0, 40),
      },
    }));
    return keepsake;
  },

  runCronNow: () => {
    const s = get();
    const { state, summary } = runCron(s.state);
    if (!summary.ran) return;

    // Update the day-streak based on yesterday's performance.
    let stats = state.stats;
    let character = state.character;
    let shieldUsed = false;
    if (summary.hadActive) {
      if (summary.allDone) {
        const currentStreak = stats.currentStreak + 1;
        stats = {
          ...stats,
          currentStreak,
          longestStreak: Math.max(stats.longestStreak, currentStreak),
        };
      } else if (character.inventory.streakShield > 0) {
        // A missed day, but a shield keeps the streak intact.
        shieldUsed = true;
        character = {
          ...character,
          inventory: {
            ...character.inventory,
            streakShield: character.inventory.streakShield - 1,
          },
        };
      } else {
        stats = { ...stats, currentStreak: 0 };
      }
    }

    // If the accumulated daily damage was fatal, the adventurer falls.
    const rev = reviveIfDead(character);
    if (rev.died) {
      stats = { ...stats, timesFallen: stats.timesFallen + 1, currentStreak: 0 };
      set({ fallen: rev.character.level });
    }

    set({ state: { ...state, character: rev.character, stats } });

    if (rev.died) {
      s.pushToast("You fell overnight. Lost a level and some gold.", "loss");
    } else if (shieldUsed) {
      s.pushToast("A streak shield absorbed a missed day. Streak safe.", "info");
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

  markBondStage: (index) => {
    const stage = BOND_STAGES[index];
    set((s) => {
      const keepsakes = [...s.state.keepsakes];
      if (stage?.letter) {
        const already = keepsakes.some(
          (k) => k.kind === "letter" && k.title === stage.name,
        );
        if (!already) {
          keepsakes.unshift({
            id: uid(),
            kind: "letter",
            title: stage.name,
            text: stage.letter,
            createdAt: nowIso(),
          });
        }
      }
      return {
        bondMilestone: index,
        state: {
          ...s.state,
          bond: { ...s.state.bond, lastStageIndex: index },
          keepsakes: keepsakes.slice(0, 40),
        },
      };
    });
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
          lastTalkedAt: nowIso(),
        },
      },
    })),
}));
