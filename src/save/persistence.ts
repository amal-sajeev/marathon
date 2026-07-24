import { get as idbGet, set as idbSet } from "idb-keyval";
import { useStore, normalizeState } from "../state/store";
import { runCron } from "../state/cron";
import { initNotifications } from "../notify/notifications";
import type { GameState, Settings } from "../state/types";
import { decodeSave, encodeSave } from "./rpgsave";
import {
  ensurePermission,
  forgetStoredHandle,
  getStoredHandle,
  hasPermission,
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
const LAST_SYNCED_KEY = "rpgtask:last-synced";
const BACKUPS_KEY = "rpgtask:backups";
/** Don't snapshot a rolling backup more often than this. */
const BACKUP_MIN_INTERVAL = 10 * 60 * 1000;
const MAX_BACKUPS = 10;

const DEFAULT_CHECK_IN_TIMES = ["09:00", "20:00"];

export interface BackupEntry {
  savedAt: string;
  data: string;
}

/** Is timestamp a strictly newer than b? */
function newer(a?: string, b?: string): boolean {
  if (!a) return false;
  if (!b) return true;
  return new Date(a).getTime() > new Date(b).getTime();
}

export async function listBackups(): Promise<BackupEntry[]> {
  const arr = (await idbGet(BACKUPS_KEY)) as BackupEntry[] | undefined;
  return Array.isArray(arr) ? arr : [];
}

async function pushBackup(encoded: string): Promise<void> {
  const arr = await listBackups();
  const last = arr[arr.length - 1];
  if (last && Date.now() - new Date(last.savedAt).getTime() < BACKUP_MIN_INTERVAL) {
    return;
  }
  arr.push({ savedAt: new Date().toISOString(), data: encoded });
  await idbSet(BACKUPS_KEY, arr.slice(-MAX_BACKUPS));
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey ?? "",
        model: parsed.model ?? "mistral-small-latest",
        proxyUrl: parsed.proxyUrl ?? "",
        checkInsEnabled: parsed.checkInsEnabled ?? false,
        checkInTimes: Array.isArray(parsed.checkInTimes)
          ? parsed.checkInTimes
          : DEFAULT_CHECK_IN_TIMES,
        pushUrl: parsed.pushUrl ?? "",
        weeklyReview: parsed.weeklyReview ?? false,
        spontaneousEnabled: parsed.spontaneousEnabled ?? false,
        spontaneousCount: parsed.spontaneousCount ?? 2,
        spontaneousStart: parsed.spontaneousStart ?? "10:00",
        spontaneousEnd: parsed.spontaneousEnd ?? "21:00",
        nightlyDebrief: parsed.nightlyDebrief ?? true,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    apiKey: "",
    model: "mistral-small-latest",
    proxyUrl: "",
    checkInsEnabled: false,
    checkInTimes: DEFAULT_CHECK_IN_TIMES,
    pushUrl: "",
    weeklyReview: false,
    spontaneousEnabled: false,
    spontaneousCount: 2,
    spontaneousStart: "10:00",
    spontaneousEnd: "21:00",
    nightlyDebrief: true,
  };
}

function persistSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

let saveTimer: number | undefined;
let lastSerialized = "";

async function writeToDisk(state: GameState): Promise<void> {
  const store = useStore.getState();
  // Stamp a save time so cross-device conflicts can be resolved newest-wins.
  const stamped: GameState = { ...state, updatedAt: new Date().toISOString() };
  const encoded = encodeSave(stamped);

  // Always keep the in-browser backup safe first, plus a rolling snapshot.
  await idbSet(STATE_BACKUP_KEY, stamped);
  void pushBackup(encoded);

  const handle = await getStoredHandle();
  if (!handle) {
    await idbSet(LAST_SYNCED_KEY, stamped.updatedAt);
    store.setSaveStatus("saved");
    return;
  }
  // Never prompt during a background autosave - that would pop a dialog with no
  // user gesture. If access isn't currently granted, keep the backup and flag
  // that the file needs a one-tap reconnect.
  if (!(await hasPermission(handle, "readwrite"))) {
    store.setSaveStatus("needs-permission");
    return;
  }
  try {
    store.setSaveStatus("saving");
    await writeHandle(handle, encoded);
    await idbSet(LAST_SYNCED_KEY, stamped.updatedAt);
    store.setSaveStatus("saved");
  } catch {
    store.setSaveStatus("error");
  }
}

/**
 * Decide which saved copy to trust when a linked file and a local backup both
 * exist. Newest wins; if both changed since the last sync, we keep the newer
 * and tell the user we resolved a conflict.
 */
function chooseState(
  fileState: GameState,
  backup: GameState | undefined,
  lastSynced: string | undefined,
): { state: GameState; source: "file" | "backup" } {
  if (!backup) return { state: fileState, source: "file" };
  const bU = backup.updatedAt;
  const fU = fileState.updatedAt;
  const backupChanged = !!bU && bU !== lastSynced;
  const fileChanged = !!fU && fU !== lastSynced;
  if (backupChanged && fileChanged && bU !== fU) {
    useStore.getState().pushToast(
      "Resolved a save conflict; kept the newer version.",
      "info",
    );
    return newer(bU, fU)
      ? { state: backup, source: "backup" }
      : { state: fileState, source: "file" };
  }
  if (newer(bU, fU)) return { state: backup, source: "backup" };
  return { state: fileState, source: "file" };
}

/** Restore a rolling local backup by its savedAt timestamp. */
export async function restoreBackup(savedAt: string): Promise<void> {
  const store = useStore.getState();
  const arr = await listBackups();
  const entry = arr.find((e) => e.savedAt === savedAt);
  if (!entry) return;
  try {
    const decoded = decodeSave(entry.data);
    const { state } = runCron(normalizeState(decoded.state));
    store.replaceState(state);
    lastSerialized = JSON.stringify(state);
    store.pushToast("Backup restored", "info");
  } catch {
    store.pushToast("That backup could not be read", "loss");
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
  let adoptedBackupOverFile = false;

  // 1) Prefer a previously chosen save file - but only read it if access is
  //    already granted. We never prompt on boot (no user gesture): for an
  //    installed PWA the grant persists, so this is silent on later launches;
  //    otherwise we fall back to the local backup and offer a one-tap reconnect.
  const handle = await getStoredHandle();
  if (handle) {
    store.setFileName(handle.name);
    try {
      if (await hasPermission(handle, "readwrite")) {
        const raw = await readHandle(handle);
        const fileState = decodeSave(raw).state;
        const backup = (await idbGet(STATE_BACKUP_KEY)) as GameState | undefined;
        const lastSynced = (await idbGet(LAST_SYNCED_KEY)) as string | undefined;
        const chosen = chooseState(fileState, backup, lastSynced);
        loadedState = chosen.state;
        adoptedBackupOverFile = chosen.source === "backup";
        store.setSaveStatus("saved");
      } else {
        store.setSaveStatus("needs-permission");
      }
    } catch {
      // fall through to backup
      store.setSaveStatus("needs-permission");
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

  // If local edits were newer than the file, push them back so the file catches up.
  if (adoptedBackupOverFile) {
    void writeToDisk(useStore.getState().state);
  }

  // Count today's open toward the login streak (the daily gift scales with it).
  useStore.getState().registerLogin();

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

  // If a file is linked but access isn't granted this launch, grant it on the
  // user's very next tap. Because that's a real gesture, an installed PWA will
  // persist the grant and stop asking on future launches.
  if (handle && useStore.getState().saveStatus === "needs-permission") {
    const onGesture = () => {
      if (useStore.getState().saveStatus === "needs-permission") {
        void reconnectSaveFile();
      }
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
  }

  // Wire proactive check-in notifications (best-effort, no backend).
  initNotifications();
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

/**
 * Re-grant access to the linked save file. Must run from a user gesture (a tap).
 * On an installed PWA the grant then persists across launches, so this should
 * only ever be needed once. Resumes autosave with the current in-memory state.
 */
export async function reconnectSaveFile(): Promise<void> {
  const store = useStore.getState();
  const handle = await getStoredHandle();
  if (!handle) return;
  const ok = await ensurePermission(handle, "readwrite");
  if (!ok) {
    store.setSaveStatus("needs-permission");
    store.pushToast("Permission not granted", "info");
    return;
  }
  try {
    await writeHandle(handle, encodeSave(store.state));
    lastSerialized = JSON.stringify(store.state);
    store.setSaveStatus("saved");
    store.pushToast("Save file reconnected", "info");
  } catch {
    store.setSaveStatus("error");
    store.pushToast("Could not write to the save file", "loss");
  }
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
