import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";

const HANDLE_KEY = "rpgtask:file-handle";

// Minimal typings for the File System Access API (not in all lib.dom versions).
interface FSPermissionDescriptor {
  mode?: "read" | "readwrite";
}
interface FSFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FSWritableStream>;
  queryPermission?(d?: FSPermissionDescriptor): Promise<PermissionState>;
  requestPermission?(d?: FSPermissionDescriptor): Promise<PermissionState>;
}
interface FSWritableStream {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

interface PickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}
interface SavePickerOptions {
  suggestedName?: string;
  types?: PickerAcceptType[];
}
interface OpenPickerOptions {
  types?: PickerAcceptType[];
  multiple?: boolean;
}

declare global {
  interface Window {
    showSaveFilePicker?: (o?: SavePickerOptions) => Promise<FSFileHandle>;
    showOpenFilePicker?: (o?: OpenPickerOptions) => Promise<FSFileHandle[]>;
  }
}

const ACCEPT_TYPES: PickerAcceptType[] = [
  {
    description: "Marathon save",
    accept: { "application/octet-stream": [".rpgsave"] },
  },
];

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showSaveFilePicker === "function" &&
    typeof window.showOpenFilePicker === "function"
  );
}

export async function pickNewSaveFile(
  suggestedName = "hero.rpgsave",
): Promise<FSFileHandle | null> {
  if (!window.showSaveFilePicker) return null;
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: ACCEPT_TYPES,
  });
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function pickExistingSaveFile(): Promise<FSFileHandle | null> {
  if (!window.showOpenFilePicker) return null;
  const [handle] = await window.showOpenFilePicker({
    types: ACCEPT_TYPES,
    multiple: false,
  });
  if (!handle) return null;
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function getStoredHandle(): Promise<FSFileHandle | null> {
  const handle = (await idbGet(HANDLE_KEY)) as FSFileHandle | undefined;
  return handle ?? null;
}

export async function forgetStoredHandle(): Promise<void> {
  await idbDel(HANDLE_KEY);
}

/**
 * Silent check - never prompts. Use this on boot and before background writes
 * so we don't trigger a permission dialog outside a user gesture (which Android
 * shows on every launch and won't persist).
 */
export async function hasPermission(
  handle: FSFileHandle,
  mode: "read" | "readwrite" = "readwrite",
): Promise<boolean> {
  if (!handle.queryPermission) return true;
  return (await handle.queryPermission({ mode })) === "granted";
}

/**
 * Check, then prompt if needed. MUST be called from a user gesture (a tap) so
 * that an installed PWA persists the grant across launches.
 */
export async function ensurePermission(
  handle: FSFileHandle,
  mode: "read" | "readwrite" = "readwrite",
): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const opts: FSPermissionDescriptor = { mode };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}

export async function writeHandle(
  handle: FSFileHandle,
  contents: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function readHandle(handle: FSFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

// --- Fallback: plain download / upload for browsers without FS Access ---

export function downloadSave(contents: string, filename = "hero.rpgsave"): void {
  const blob = new Blob([contents], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function uploadSave(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".rpgsave,application/json,application/octet-stream";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve(await file.text());
    };
    input.click();
  });
}
