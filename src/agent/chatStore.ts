import { create } from "zustand";
import type { ToolEvent } from "./mistral";
import type { Emotion } from "./emotions";

export interface VisibleMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  toolEvents?: ToolEvent[];
  /** Leela's expression for this message (assistant only) */
  emotion?: Emotion;
  /** suggested quick replies to show under this message (assistant only) */
  chips?: string[];
  /** ISO timestamp; drives day separators and dates the diary against a day */
  createdAt: string;
}

/** What callers pass to add(); the timestamp is stamped for them. */
export type NewMessage = Omit<VisibleMessage, "createdAt"> & { createdAt?: string };

/** The shape persisted per save. */
export interface StoredChat {
  messages: VisibleMessage[];
  summary?: string;
  summarizedThrough?: string;
}

interface ChatStore {
  messages: VisibleMessage[];
  busy: boolean;
  /** rolling précis of everything older than summarizedThrough */
  summary?: string;
  /** id of the newest message already folded into summary */
  summarizedThrough?: string;
  add: (m: NewMessage) => void;
  setBusy: (b: boolean) => void;
  reset: () => void;
  hydrate: (stored: StoredChat) => void;
  setSummary: (summary: string, throughId: string) => void;
}

let counter = 0;
export const nextId = () => `m${Date.now()}_${counter++}`;

export const useChat = create<ChatStore>((set) => ({
  messages: [],
  busy: false,
  summary: undefined,
  summarizedThrough: undefined,
  add: (m) =>
    set((s) => ({
      messages: [...s.messages, { ...m, createdAt: m.createdAt ?? new Date().toISOString() }],
    })),
  setBusy: (b) => set({ busy: b }),
  reset: () => set({ messages: [], summary: undefined, summarizedThrough: undefined }),
  hydrate: (stored) =>
    set({
      messages: Array.isArray(stored.messages) ? stored.messages : [],
      summary: stored.summary,
      summarizedThrough: stored.summarizedThrough,
    }),
  setSummary: (summary, throughId) => set({ summary, summarizedThrough: throughId }),
}));
