import { useStore } from "../state/store";
import { isDailyActiveOn, todayStr } from "../state/cron";
import type { Daily, Settings, Todo } from "../state/types";
import { runCheckIn } from "../agent/checkin";

const FIRED_KEY = "rpgtask:lastCheckIns";
/** How long after a scheduled time we still consider it worth firing. */
const LATE_WINDOW_MS = 3 * 60 * 60 * 1000;
const TICK_MS = 30_000;

export function supportsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permissionStatus(): NotificationPermission | "unsupported" {
  if (!supportsNotifications()) return "unsupported";
  return Notification.permission;
}

export async function requestPermission(): Promise<boolean> {
  if (!supportsNotifications()) return false;
  try {
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

// --- fired-key bookkeeping (dedupe across OS trigger + in-app) ---

function loadFired(): string[] {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function markFired(key: string): void {
  const arr = loadFired();
  if (arr.includes(key)) return;
  arr.push(key);
  // keep the list small
  const trimmed = arr.slice(-20);
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

function isFired(key: string): boolean {
  return loadFired().includes(key);
}

// --- time helpers ---

function parseTime(time: string): [number, number] {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  return [isNaN(h) ? 0 : h, isNaN(m) ? 0 : m];
}

function todayTargetMs(time: string, from: Date): number {
  const [h, m] = parseTime(time);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function nextOccurrenceMs(time: string, from: Date): number {
  const [h, m] = parseTime(time);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= from.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function slotKey(time: string, target: Date): string {
  return `${todayStr(target)}T${time}`;
}

// --- notification body from live state ---

function summarize(): string {
  const state = useStore.getState().state;
  const now = new Date();
  const openDailies = state.tasks.filter(
    (t) => t.type === "daily" && isDailyActiveOn(t as Daily, now) && !(t as Daily).done,
  ).length;
  const openTodos = state.tasks.filter(
    (t) => t.type === "todo" && !(t as Todo).done,
  ).length;
  const parts: string[] = [];
  if (openDailies) parts.push(`${openDailies} daily${openDailies === 1 ? "" : "s"} open`);
  if (openTodos) parts.push(`${openTodos} to-do${openTodos === 1 ? "" : "s"} waiting`);
  return parts.length ? parts.join(", ") + "." : "Let's line up your next moves.";
}

// --- OS-level scheduling via Notification Triggers (Android/Chromium) ---

function hasTriggers(): boolean {
  return typeof window !== "undefined" && "TimestampTrigger" in window;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

// --- Cloudflare Worker push (reliable background delivery) ---

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Convert local "HH:MM" times to UTC "HH:MM" for the server-side scheduler. */
function toUtcTimes(times: string[]): string[] {
  return times.map((t) => {
    const [h, m] = parseTime(t);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
      d.getUTCMinutes(),
    ).padStart(2, "0")}`;
  });
}

function pushBase(): string | null {
  const url = useStore.getState().settings.pushUrl?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/** Register (or refresh) the browser's push subscription + schedule with the
 *  Worker, or unregister it when check-ins are off. */
async function syncPush(): Promise<void> {
  const base = pushBase();
  if (!base) return;
  const reg = await getRegistration();
  if (!reg || !("pushManager" in reg)) return;

  const settings = useStore.getState().settings;
  const enabled = settings.checkInsEnabled && permissionStatus() === "granted";

  if (!enabled) {
    try {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${base}/unregister`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    const keyRes = await fetch(`${base}/vapidPublicKey`);
    const { publicKey } = await keyRes.json();
    if (!publicKey) return;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await fetch(`${base}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        times: toUtcTimes(settings.checkInTimes),
      }),
    });
  } catch {
    /* best-effort; local reminders still work */
  }
}

async function scheduleAll(): Promise<void> {
  const settings = useStore.getState().settings;
  if (!settings.checkInsEnabled) return;
  if (permissionStatus() !== "granted") return;
  if (!hasTriggers()) return;

  const reg = await getRegistration();
  if (!reg) return;

  const now = new Date();
  const body = summarize();
  for (const time of settings.checkInTimes) {
    const ts = nextOccurrenceMs(time, now);
    try {
      await reg.showNotification("Leela", {
        body,
        tag: `checkin-${time}`,
        // @ts-expect-error - showTrigger is not yet in the TS DOM lib
        showTrigger: new window.TimestampTrigger(ts),
        badge: "icons/icon.svg",
        icon: "icons/icon.svg",
        data: { type: "checkin", time },
      });
    } catch {
      /* trigger scheduling unsupported or failed; in-app catch-up still works */
    }
  }
}

/** Close any (pending or shown) notification for a slot once handled in-app. */
async function clearSlotNotification(time: string): Promise<void> {
  const reg = await getRegistration();
  if (!reg) return;
  try {
    const ns = await reg.getNotifications({
      tag: `checkin-${time}`,
      // @ts-expect-error - includeTriggered is a Triggers API option
      includeTriggered: true,
    });
    ns.forEach((n) => n.close());
  } catch {
    /* ignore */
  }
}

// --- firing logic ---

let running = false;

async function fireCheckIn(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runCheckIn();
  } finally {
    running = false;
  }
}

/** Check every configured slot; run the check-in if one is due and unfired. */
function maybeRunDue(): void {
  const settings = useStore.getState().settings;
  if (!settings.checkInsEnabled) return;

  const now = new Date();
  for (const time of settings.checkInTimes) {
    const target = todayTargetMs(time, now);
    const delta = now.getTime() - target;
    if (delta < 0 || delta > LATE_WINDOW_MS) continue;
    const key = slotKey(time, new Date(target));
    if (isFired(key)) continue;

    markFired(key);
    void clearSlotNotification(time);

    // If we're visible, run the conversation. If hidden and notifications are
    // available, ping so the user knows; the tap/return will run it.
    if (document.visibilityState === "visible") {
      void fireCheckIn();
    } else if (permissionStatus() === "granted") {
      void getRegistration().then((reg) => {
        reg?.showNotification("Leela", {
          body: summarize(),
          tag: `checkin-${time}`,
          icon: "icons/icon.svg",
          data: { type: "checkin", time },
        });
      });
    } else {
      // no visibility, no notifications: leave unfired so it runs on next open
      // (undo the mark so catch-up can still fire it)
      const arr = loadFired().filter((k) => k !== key);
      try {
        localStorage.setItem(FIRED_KEY, JSON.stringify(arr));
      } catch {
        /* ignore */
      }
    }
  }
}

// --- init ---

let started = false;

export function initNotifications(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // Tap on a check-in notification (existing window) -> run check-in.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
      if (e.data?.type === "run-checkin") void fireCheckIn();
    });
  }

  // Opened fresh from a notification tap.
  if (window.location.hash.replace("#", "") === "checkin") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    // let the app settle, then run
    setTimeout(() => void fireCheckIn(), 400);
  }

  // Catch up on any slot we missed while closed, then schedule ahead.
  maybeRunDue();
  void scheduleAll();
  void syncPush();

  // Poll while the app is open.
  window.setInterval(maybeRunDue, TICK_MS);

  // Re-evaluate when the tab becomes visible.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      maybeRunDue();
      void scheduleAll();
      void syncPush();
    }
  });

  // Reschedule whenever check-in settings change.
  let prev: Settings = useStore.getState().settings;
  useStore.subscribe((s) => {
    if (
      s.settings.checkInsEnabled !== prev.checkInsEnabled ||
      s.settings.checkInTimes !== prev.checkInTimes ||
      s.settings.pushUrl !== prev.pushUrl
    ) {
      prev = s.settings;
      void scheduleAll();
      void syncPush();
    }
  });
}
