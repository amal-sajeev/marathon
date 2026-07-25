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
  /** optional reminder. Dailies use "HH:MM"; to-dos use an ISO datetime. */
  remindAt?: string;
  /**
   * Set when Leela created this rather than the user. Missing one of hers costs
   * her mood more than missing one you set yourself.
   */
  suggestedByLeela?: boolean;
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

/** Consumables the adventurer can stockpile and use. */
export interface Inventory {
  /** restores a chunk of HP on use */
  hpPotion: number;
  /** boosts XP gains for the rest of the day when used */
  xpCharm: number;
  /** auto-spent to protect the day-streak when a day is missed */
  streakShield: number;
}

/** Time-boxed effects currently in play. */
export interface Buffs {
  /** ISO datetime until which XP gains are multiplied */
  xpMultUntil?: string;
}

export interface Character {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  xp: number;
  gold: number;
  inventory: Inventory;
  buffs: Buffs;
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
  /** good habit occurrences ever logged */
  habitsScored: number;
}

/** A lasting, personal fact Leela keeps about the user so she can be warm and
 *  specific across sessions. Persisted in the save file. */
export interface Memory {
  id: string;
  /** the detail itself, phrased from Leela's perspective ("Their sister's name is Mara"). */
  text: string;
  /** loose grouping: person, preference, goal, wellbeing, milestone, other */
  category?: string;
  /** 1..3; higher means more central to who they are, kept in context first */
  importance?: number;
  createdAt: string;
  updatedAt: string;
}

/** Tracks how close Leela and the user have grown, so her warmth can deepen
 *  over time. Persisted in the save file. */
export interface Bond {
  /** ISO timestamp of the first time they met (usually the save's creation). */
  firstMet: string;
  /** number of conversational turns/check-ins they've shared */
  interactions: number;
  /** highest bond stage index already celebrated, so milestones fire once */
  lastStageIndex?: number;
  /** ISO timestamp of the last real conversation (presence, not score). */
  lastTalkedAt?: string;
}

/** Cosmetic customization bought with gold. Empty string means the default. */
export interface Cosmetics {
  /** accent color id (see game/cosmetics) */
  accent: string;
  /** companion orb / FAB skin id */
  orbSkin: string;
  /** rank badge frame id */
  badgeFrame: string;
  /** ids of everything unlocked so far */
  owned: string[];
}

/** A quick mood check-in the user logs and Leela can respond to. */
export interface MoodEntry {
  id: string;
  /** yyyy-mm-dd */
  date: string;
  /** 1 (rough) .. 5 (great) */
  mood: number;
  note?: string;
  createdAt: string;
}

/** One day's activity, for the trends heatmap. */
export interface DayRecord {
  /** yyyy-mm-dd */
  date: string;
  /** dailies + to-dos completed that day */
  completed: number;
  /** XP earned that day */
  xp: number;
}

/** Something Leela decided to raise later ("ask about the interview tomorrow"). */
export interface Followup {
  id: string;
  /** the reminder to herself, phrased as a note. */
  text: string;
  /** yyyy-mm-dd it becomes relevant; omitted means the next chance. */
  dueDate?: string;
  createdAt: string;
  done?: boolean;
}

/** Light engagement bookkeeping: the daily gift and login streak. */
export interface Engagement {
  /** yyyy-mm-dd the daily gift was last granted. */
  lastGiftDate?: string;
  /** yyyy-mm-dd of the last app open counted for the streak. */
  lastLoginDate?: string;
  /** consecutive days opened. */
  loginStreak: number;
  /** yyyy-mm-dd the nightly debrief last ran. */
  lastDebriefDate?: string;
  /** yyyy-mm-dd of the last Sunday letter Leela wrote. */
  lastSundayLetter?: string;
}

/**
 * Private texture unique to this pair: in-jokes, nicknames for quests, a
 * codeword, a shorthand for low-energy days. Grows alongside the bond without
 * replacing it.
 */
export interface Signature {
  /** a private word or phrase the two of you share */
  codeword?: string;
  /** what they say (or she uses) for a low-energy day */
  energyWord?: string;
  /** task id -> nickname Leela uses for that quest */
  nicknames: Record<string, string>;
  /** recurring bits / in-jokes (short, from Leela's perspective) */
  bits: string[];
}

/** A lasting note or caption Leela leaves in the Service Record. */
export interface Keepsake {
  id: string;
  kind: "milestone" | "letter" | "ritual" | "diary" | "other";
  title: string;
  text: string;
  createdAt: string;
  /** diary pages carry the face she wrote them with */
  emotion?: string;
  /** yyyy-mm-dd the diary entry is about */
  date?: string;
}

/**
 * How Leela is doing, as a number that persists between sessions.
 *
 * Kept separate from the per-message emotion tag: that's how she feels about
 * the sentence she's writing, this is the weather she's been living in since
 * the last rollover. Only her expression of a low mood is gated by bond stage;
 * the arithmetic always runs, so the diary has material from day one.
 */
export interface LeelaMood {
  /** 0..100, baseline 60 */
  value: number;
  /** yyyy-mm-dd of the last daily settlement */
  lastSettled?: string;
  /** why she's where she is, surfaced in her context and the diary */
  reason?: string;
  /**
   * The specific daily she suggested and they missed. Kept apart from `reason`,
   * which is prose, because the opener has to name the task exactly and
   * survives into the next session after the CronSummary is long gone.
   */
  missedTask?: string;
  /** resting expression held for the rest of the day after a miss */
  lockedEmotion?: string;
  lockedUntil?: string;
  /** yyyy-mm-dd the disappointed opener already fired, so it lands once */
  ackDate?: string;
  /** set when a completion pulls her out of a low; consumed by the next turn */
  reliefPending?: boolean;
  /** ISO of the last HP damage, drives the cracked-glass decay */
  damageAt?: string;
}

/** Something Leela asks of the user, so the bond has stakes on her side too. */
export interface BondRequest {
  id: string;
  /** bond stage she was at when she asked */
  stageIndex: number;
  goal: {
    kind: "streak" | "dailies";
    target: number;
    /** yyyy-mm-dd deadline, if she set one */
    byDate?: string;
  };
  /** what she promises in return, in her words */
  reward: string;
  /** the lore entry she's holding back until this lands, if any */
  loreId?: string;
  status: "open" | "done" | "lapsed";
  createdAt: string;
}

export interface GameState {
  /**
   * Stable identity for this save, so device-local data (the chat transcript,
   * rolling backups) can be scoped to it and never bleed between characters.
   * Legacy saves derive one from createdAt rather than a fresh random value, so
   * the same file opened on two devices resolves to the same id.
   */
  saveId: string;
  character: Character;
  tasks: Task[];
  stats: Stats;
  /** lasting personal details Leela remembers about the user */
  memories: Memory[];
  /** how close Leela and the user have grown */
  bond: Bond;
  /** quick mood check-ins over time */
  moods: MoodEntry[];
  /** rolling per-day activity for trends */
  history: DayRecord[];
  /** cosmetic customization */
  cosmetics: Cosmetics;
  /** things Leela means to raise later */
  followups: Followup[];
  /** daily gift + login streak bookkeeping */
  engagement: Engagement;
  /** private texture: codeword, bits, quest nicknames */
  signature: Signature;
  /** notes / captions Leela leaves in the Service Record */
  keepsakes: Keepsake[];
  /** how Leela is doing, driven by how the board goes */
  leelaMood: LeelaMood;
  /** things Leela has asked of the user */
  bondRequests: BondRequest[];
  /** ids from the lore pool she has already told them about */
  unlockedLore: string[];
  /** ISO date (yyyy-mm-dd) that cron last ran */
  lastCron?: string;
  createdAt: string;
  /** ISO timestamp of the last state change, for sync conflict resolution */
  updatedAt: string;
}

export interface Settings {
  apiKey: string;
  model: string;
  proxyUrl: string;
  /** whether Leela proactively checks in at set times */
  checkInsEnabled: boolean;
  /** daily check-in times as "HH:MM" (24h), local time */
  checkInTimes: string[];
  /** optional Cloudflare Worker URL for reliable background push */
  pushUrl: string;
  /** run a reflective weekly review with Leela on Sundays */
  weeklyReview: boolean;
  /** Leela sends unscheduled, spontaneous check-ins during the day */
  spontaneousEnabled?: boolean;
  /** how many spontaneous pings per day (1..6) */
  spontaneousCount?: number;
  /** local "HH:MM" window start she'll ping within */
  spontaneousStart?: string;
  /** local "HH:MM" window end she'll ping within */
  spontaneousEnd?: string;
  /** offer / run a short nightly debrief with Leela in the evening */
  nightlyDebrief?: boolean;
  /**
   * How strongly Leela reacts to a bad day. "full" lets her show it once you're
   * past the first bond stage; "gentle" keeps the warmth but drops the visible
   * disappointment; "off" disables the reactive layer entirely.
   */
  reactiveMood?: "off" | "gentle" | "full";
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
