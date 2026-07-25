// Keeps the conversation across reloads, scoped to the save it belongs to.
//
// The transcript deliberately lives in device-local IndexedDB rather than in
// the .rpgsave: it changes on every message, which would churn the file and add
// noise to the updatedAt conflict resolution, and the durable record of the
// relationship is the diary in the Service Record, which does travel with the
// save. Keying by saveId is what stops one character's conversation showing up
// under another.
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
import { deriveSaveId, useStore } from "../state/store";
import { useChat, type StoredChat } from "./chatStore";

const MAX_STORED = 200;
const DEBOUNCE_MS = 500;

const chatKey = (saveId: string) => `rpgtask:chat:${saveId}`;

let timer: number | undefined;
/** the save the in-memory transcript currently belongs to */
let activeSaveId = "";
/** suppress the write that would otherwise follow our own hydrate */
let hydrating = false;

function snapshot(): StoredChat {
  const { messages, summary, summarizedThrough } = useChat.getState();
  return { messages: messages.slice(-MAX_STORED), summary, summarizedThrough };
}

async function flush(saveId: string): Promise<void> {
  if (!saveId) return;
  const chat = snapshot();
  try {
    if (chat.messages.length === 0 && !chat.summary) {
      await idbDel(chatKey(saveId));
    } else {
      await idbSet(chatKey(saveId), chat);
    }
  } catch {
    /* a lost transcript is not worth surfacing an error over */
  }
}

function schedule(): void {
  if (hydrating || !activeSaveId) return;
  const saveId = activeSaveId;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => void flush(saveId), DEBOUNCE_MS);
}

/** Swap the in-memory transcript over to a different save. */
async function switchTo(saveId: string): Promise<void> {
  if (saveId === activeSaveId) return;

  // Write the outgoing save's transcript before the store is overwritten.
  if (timer) window.clearTimeout(timer);
  if (activeSaveId) await flush(activeSaveId);

  activeSaveId = saveId;
  let stored: StoredChat | undefined;
  try {
    stored = (await idbGet(chatKey(saveId))) as StoredChat | undefined;
  } catch {
    stored = undefined;
  }

  hydrating = true;
  useChat.getState().hydrate(stored ?? { messages: [] });
  hydrating = false;
}

/** Drop the current save's conversation. */
export async function clearChat(): Promise<void> {
  if (timer) window.clearTimeout(timer);
  useChat.getState().reset();
  if (activeSaveId) await idbDel(chatKey(activeSaveId)).catch(() => {});
}

/**
 * Wire transcript persistence. Called from initPersistence once the store has
 * been hydrated, so the first saveId we see is the real one.
 */
export function initChatPersistence(): void {
  void switchTo(deriveSaveId(useStore.getState().state));

  useChat.subscribe(schedule);

  // Loading a save file, importing, or restoring a backup all go through
  // replaceState, so watching saveId covers every path that swaps characters.
  useStore.subscribe((s, prev) => {
    if (s.state === prev.state) return;
    const next = deriveSaveId(s.state);
    if (next !== activeSaveId) void switchTo(next);
  });

  // Best-effort final write when the tab goes away mid-debounce.
  window.addEventListener("pagehide", () => {
    if (activeSaveId) void flush(activeSaveId);
  });
}
