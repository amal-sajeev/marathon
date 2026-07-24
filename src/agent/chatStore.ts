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
}

interface ChatStore {
  messages: VisibleMessage[];
  busy: boolean;
  add: (m: VisibleMessage) => void;
  setBusy: (b: boolean) => void;
  reset: () => void;
}

let counter = 0;
export const nextId = () => `m${Date.now()}_${counter++}`;

export const useChat = create<ChatStore>((set) => ({
  messages: [],
  busy: false,
  add: (m) => set((s) => ({ messages: [...s.messages, m] })),
  setBusy: (b) => set({ busy: b }),
  reset: () => set({ messages: [] }),
}));
