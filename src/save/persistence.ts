import { get as idbGet, set as idbSet } from "idb-keyval";
import { useStore, normalizeState } from "../state/store";
import { runCron } from "../state/cron";
import type { GameState, Settings } from "../state/types";
import { decodeSave, encodeSave } from "./rpgsave";
import {
  ensurePermission,
  forgetStoredHandle,
  getStoredHandle,
  pickExistingSaveFile,
  pickNewSaveFile,
  readHandle,
  supportsFileSystemAccess,
  writeHandle,
  downloadSave,
  uploadSave,
} from "./fileAccess";

const STATE_BACKUP_KEY = "rpgtask:state-backup";
const SETTINGS_KEY = "rpgtask:settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey ?? "",
        model: parsed.model ?? "mistral-small-latest",
        proxyUrl: parsed.proxyUrl ?? "",
      };
    }
  } catch {
    /* ignore */
  }
  return { apiKey: "", model: "mistral-small-latest", proxyUrl: "" };
}

function persistSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

let saveTimer: number | undefined;
let lastSerialized = "";

async function writeToDisk(state: GameState): Promise<void> {
  const store = useStore.getState();
  await idbSet(STATE_BACKUP_KEY, state);

  const handle = await getStoredHandle();
  if (!handle) {
    store.setSaveStatus("saved");
    return;
  }
  try {
    store.setSaveStatus("saving");
    const ok = await ensurePermission(handle, "readwrite");
    if (!ok) {
      store.setSaveStatus("error");
      return;
    }
    await writeHandle(handle, encodeSave(state));
    store.setSaveStatus("saved");
  } catch {
    store.setSaveStatus("error");
  }
}

function scheduleSave(state: GameState): void {
  const serialized = JSON.stringify(state);
  if (serialized === lastSerialized) return;
  lastSerialized = serialized;
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void writeToDisk(state);
  }, 700);
}

/** Boot: load settings + best-available saved state, run cron, then wire autosave. */
export async function initPersistence(): Promise<void> {
  const store = useStore.getState();
  const settings = loadSettings();
  store.setFileSupported(supportsFileSystemAccess());

  let loadedState: GameState | null = null;

  // 1) Prefer a previously chosen save file.
  const handle = await getStoredHandle();
  if (handle) {
    try {
      const granted = await ensurePermission(handle, "readwrite");
      if (granted) {
        const raw = await readHandle(handle);
        loadedState = decodeSave(raw).state;
        store.setFileName(handle.name);
      }
    } catch {
      // fall through to backup
    }
  }

  // 2) Otherwise use the local IndexedDB backup.
  if (!loadedState) {
    const backup = (await idbGet(STATE_BACKUP_KEY)) as GameState | undefined;
    if (backup) loadedState = backup;
  }

  // 3) Hydrate (freshState default already lives in the store).
  if (loadedState) {
    const { state: afterCron } = runCron(normalizeState(loadedState));
    store.hydrate(afterCron, settings);
  } else {
    store.hydrate(useStore.getState().state, settings);
  }

  lastSerialized = JSON.stringify(useStore.getState().state);

  // Persist settings whenever they change.
  useStore.subscribe((s, prev) => {
    if (s.settings !== prev.settings) persistSettings(s.settings);
  });

  // Autosave game state (debounced) whenever it changes.
  useStore.subscribe((s, prev) => {
    if (s.state !== prev.state) scheduleSave(s.state);
  });

  // Run cron again if the app is left open across midnight / resumed.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      useStore.getState().runCronNow();
    }
  });
}

// --- Actions surfaced to the Settings UI ---

export async function createNewSaveFile(): Promise<void> {
  const store = useStore.getState();
  const handle = await pickNewSaveFile();
  if (!handle) return;
  store.setFileName(handle.name);
  await writeHandle(handle, encodeSave(store.state));
  store.setSaveStatus("saved");
}

export async function loadSaveFile(): Promise<void> {
  const store = useStore.getState();
  const handle = await pickExistingSaveFile();
  if (!handle) return;
  const raw = await readHandle(handle);
  const decoded = decodeSave(raw);
  const { state } = runCron(normalizeState(decoded.state));
  store.replaceState(state);
  store.setFileName(handle.name);
  lastSerialized = JSON.stringify(state);
  store.pushToast(`Loaded ${handle.name}`, "info");
}

export async function detachSaveFile(): Promise<void> {
  const store = useStore.getState();
  await forgetStoredHandle();
  store.setFileName(null);
  store.pushToast("Save file detached. Local backup still active.", "info");
}

export function exportSaveDownload(): void {
  const store = useStore.getState();
  downloadSave(encodeSave(store.state));
}

export async function importSaveUpload(): Promise<void> {
  const store = useStore.getState();
  const raw = await uploadSave();
  if (!raw) return;
  try {
    const decoded = decodeSave(raw);
    const { state } = runCron(normalizeState(decoded.state));
    store.replaceState(state);
    lastSerialized = JSON.stringify(state);
    store.pushToast("Save imported", "info");
  } catch {
    store.pushToast("That file could not be read as a save", "loss");
  }
}
