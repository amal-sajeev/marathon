import { create } from "zustand";
import type { ToolEvent } from "./mistral";

export interface VisibleMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  toolEvents?: ToolEvent[];
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
