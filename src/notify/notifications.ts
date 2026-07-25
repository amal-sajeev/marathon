import { set as idbSet, del as idbDel } from "idb-keyval";
import { useStore } from "../state/store";
import { isDailyActiveOn, todayStr } from "../state/cron";
import type { Daily, Settings, Todo } from "../state/types";
import { runCheckIn, runWeeklyReview } from "../agent/checkin";
import { initEventPings } from "./events";
import { computeBoardTag } from "./boardTag";

const FIRED_KEY = "rpgtask:lastCheckIns";
/** How long after a scheduled time we still consider it worth firing. */
const LATE_WINDOW_MS = 3 * 60 * 60 * 1000;
const TICK_MS = 30_000;

/** Raster assets Android can actually render on a notification. */
const NOTIFY_ICON = "icons/notify-192.png";
const NOTIFY_BADGE = "icons/badge-72.png";
/** Keys the service worker reads so it can re-register on subscription change. */
const IDB_PUSH_KEY = "rpgtask:push";
const IDB_PUSH_URL_KEY = "rpgtask:pushUrl";

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

export interface RandomConfig {
  count: number;
  /** UTC "HH:MM" window bounds for the server-side scheduler */
  startUtc: string;
  endUtc: string;
}

/** Convert a single local "HH:MM" to UTC "HH:MM". */
function toUtcTime(time: string): string {
  const [h, m] = parseTime(time);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

/** Build the spontaneous-checkin config to send the Worker, or null if off. */
function buildRandomConfig(settings: Settings): RandomConfig | null {
  if (!settings.spontaneousEnabled) return null;
  const count = Math.max(1, Math.min(6, settings.spontaneousCount ?? 2));
  const start = settings.spontaneousStart || "10:00";
  const end = settings.spontaneousEnd || "21:00";
  return { count, startUtc: toUtcTime(start), endUtc: toUtcTime(end) };
}

export interface PushStatus {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  endpoint: string | null;
}

/** Inspect the current push wiring, for the Settings diagnostics panel. */
export async function getPushStatus(): Promise<PushStatus> {
  const permission = permissionStatus();
  const base = pushBase();
  const supported =
    typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  let subscribed = false;
  let endpoint: string | null = null;
  if (supported) {
    const reg = await getRegistration();
    if (reg && "pushManager" in reg) {
      try {
        const sub = await reg.pushManager.getSubscription();
        subscribed = !!sub;
        endpoint = sub?.endpoint ?? null;
      } catch {
        /* ignore */
      }
    }
  }
  return { supported, configured: !!base, permission, subscribed, endpoint };
}

function toast(text: string, kind: "gain" | "loss" | "info" = "info"): void {
  try {
    useStore.getState().pushToast(text, kind);
  } catch {
    /* ignore */
  }
}

/** Register (or refresh) the browser's push subscription + schedule with the
 *  Worker, or unregister it when check-ins are off. When `announce` is set the
 *  outcome (including failures Android usually hides) is surfaced as a toast. */
async function syncPush(opts?: { announce?: boolean }): Promise<boolean> {
  const announce = !!opts?.announce;
  const base = pushBase();
  if (!base) {
    if (announce) toast("Add a push server URL in Settings first.", "info");
    return false;
  }
  const reg = await getRegistration();
  if (!reg || !("pushManager" in reg)) {
    if (announce) toast("Push isn't supported on this browser.", "loss");
    return false;
  }

  const settings = useStore.getState().settings;
  const permission = permissionStatus();
  const enabled = settings.checkInsEnabled && permission === "granted";

  if (!enabled) {
    // If the user wants check-ins but permission was revoked (common on Android
    // for "unused" apps), keep the server record and tell them how to fix it.
    if (settings.checkInsEnabled && permission === "denied") {
      if (announce) toast("Notifications are blocked. Re-enable them in your browser/site settings.", "loss");
      return false;
    }
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
    await idbDel(IDB_PUSH_KEY).catch(() => {});
    await idbDel(IDB_PUSH_URL_KEY).catch(() => {});
    return false;
  }

  try {
    const keyRes = await fetch(`${base}/vapidPublicKey`);
    if (!keyRes.ok) throw new Error(`server ${keyRes.status}`);
    const { publicKey } = await keyRes.json();
    if (!publicKey) throw new Error("server returned no VAPID key");

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const times = toUtcTimes(settings.checkInTimes);
    const random = buildRandomConfig(settings);
    // Only as fresh as this sync, which happens on boot, on visibility change,
    // and when settings change. Copy can therefore lag the real board a little.
    const boardTag = computeBoardTag(useStore.getState().state);
    const res = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), times, random, boardTag }),
    });
    if (!res.ok) throw new Error(`register failed (${res.status})`);

    // Let the service worker re-register itself if the browser rotates the sub.
    await idbSet(IDB_PUSH_KEY, { base, times, random, boardTag }).catch(() => {});
    await idbSet(IDB_PUSH_URL_KEY, base).catch(() => {});

    if (announce) toast("Push is set up. Check-ins will arrive even when closed.", "gain");
    return true;
  } catch (err) {
    if (announce) {
      toast(`Push setup failed: ${err instanceof Error ? err.message : String(err)}`, "loss");
    }
    return false;
  }
}

/** Force a fresh (re)subscribe + register, surfacing the result. For Settings. */
export async function resyncPush(): Promise<boolean> {
  return syncPush({ announce: true });
}

/** Ask the Worker to push a notification to this device right now, to confirm
 *  end-to-end delivery from the phone. */
export async function sendTestPush(): Promise<boolean> {
  const base = pushBase();
  if (!base) {
    toast("Add a push server URL in Settings first.", "info");
    return false;
  }
  if (permissionStatus() !== "granted") {
    toast("Enable notifications first.", "info");
    return false;
  }
  // Make sure we're subscribed before asking for a test.
  await syncPush();
  const reg = await getRegistration();
  const sub = reg && "pushManager" in reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) {
    toast("Not subscribed yet. Tap 'Reconnect push' and try again.", "loss");
    return false;
  }
  try {
    const res = await fetch(`${base}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (!res.ok) throw new Error(`server ${res.status}`);
    toast("Test sent. It should arrive in a moment.", "gain");
    return true;
  } catch (err) {
    toast(`Test failed: ${err instanceof Error ? err.message : String(err)}`, "loss");
    return false;
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
        badge: NOTIFY_BADGE,
        icon: NOTIFY_ICON,
        data: { type: "checkin", time },
      });
    } catch {
      /* trigger scheduling unsupported or failed; in-app catch-up still works */
    }
  }
}

// --- per-task reminders ---

/** Next timestamp (ms) at which a daily's reminder should fire, or null. */
function nextDailyReminderMs(
  time: string,
  repeatDays: number[] | undefined,
  from: Date,
): number | null {
  const [h, m] = parseTime(time);
  for (let i = 0; i < 8; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= from.getTime()) continue;
    const active = !repeatDays || repeatDays.length === 0 || repeatDays.includes(d.getDay());
    if (active) return d.getTime();
  }
  return null;
}

/** Schedule OS-level reminders for any task with a remindAt (Android/Chromium). */
async function scheduleTaskReminders(): Promise<void> {
  if (permissionStatus() !== "granted") return;
  if (!hasTriggers()) return;
  const reg = await getRegistration();
  if (!reg) return;

  const now = new Date();
  const tasks = useStore.getState().state.tasks;
  for (const t of tasks) {
    if (!t.remindAt) continue;
    let ts: number | null = null;
    if (t.type === "daily") {
      ts = nextDailyReminderMs(t.remindAt, (t as Daily).repeatDays, now);
    } else if (t.type === "todo") {
      if ((t as Todo).done) continue;
      const dt = new Date(t.remindAt).getTime();
      ts = !Number.isNaN(dt) && dt > now.getTime() ? dt : null;
    }
    if (ts == null) continue;
    try {
      await reg.showNotification("Leela", {
        body: `Reminder: ${t.title}`,
        tag: `remind-${t.id}`,
        // @ts-expect-error - showTrigger is not yet in the TS DOM lib
        showTrigger: new window.TimestampTrigger(ts),
        badge: NOTIFY_BADGE,
        icon: NOTIFY_ICON,
        data: { type: "reminder", id: t.id },
      });
    } catch {
      /* triggers unsupported; skip */
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

/** ISO-ish year+week key so a weekly review runs at most once per week. */
function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-w${week}`;
}

/** Run the reflective weekly review on Sundays if enabled and not yet done. */
function maybeRunWeekly(): void {
  const settings = useStore.getState().settings;
  if (!settings.weeklyReview) return;
  const now = new Date();
  // Sunday, from late morning on, once per calendar week.
  if (now.getDay() !== 0 || now.getHours() < 10) return;
  const key = `weekly-${weekKey(now)}`;
  if (isFired(key)) return;
  // Only run when the app is visible so the conversation isn't missed; otherwise
  // leave it unfired to catch up on the next open.
  if (document.visibilityState === "visible") {
    markFired(key);
    void runWeeklyReview();
  }
}

// --- spontaneous (random) in-app check-ins ---
// The Worker fires these when the app is closed; this adds a matching jittered
// beat while the app is open so it feels alive without double-pinging.

const SPON_KEY = "rpgtask:spontaneous";

interface SponDay {
  day: string;
  times: string[];
  fired: string[];
}

function loadSpon(): SponDay | null {
  try {
    const raw = localStorage.getItem(SPON_KEY);
    return raw ? (JSON.parse(raw) as SponDay) : null;
  } catch {
    return null;
  }
}

function saveSpon(v: SponDay): void {
  try {
    localStorage.setItem(SPON_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** Pick `count` random local "HH:MM" slots inside the configured window. */
function pickSpontaneousSlots(settings: Settings): string[] {
  const count = Math.max(1, Math.min(6, settings.spontaneousCount ?? 2));
  const [sh, sm] = parseTime(settings.spontaneousStart || "10:00");
  const [eh, em] = parseTime(settings.spontaneousEnd || "21:00");
  let start = sh * 60 + sm;
  let end = eh * 60 + em;
  if (end <= start) end = start + 60; // guard against inverted local window
  const span = end - start;
  const picks = new Set<string>();
  let guard = 0;
  while (picks.size < count && guard < count * 20) {
    guard++;
    const at = start + Math.floor(Math.random() * (span + 1));
    picks.add(`${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`);
  }
  return [...picks];
}

/** While open, run a spontaneous check-in when a jittered slot comes due. */
function maybeRunSpontaneous(): void {
  const settings = useStore.getState().settings;
  if (!settings.spontaneousEnabled) return;
  if (document.visibilityState !== "visible") return;

  const now = new Date();
  const today = todayStr(now);
  let spon = loadSpon();
  if (!spon || spon.day !== today) {
    spon = { day: today, times: pickSpontaneousSlots(settings), fired: [] };
    saveSpon(spon);
  }

  for (const time of spon.times) {
    if (spon.fired.includes(time)) continue;
    const target = todayTargetMs(time, now);
    const delta = now.getTime() - target;
    // fire within a half-hour of the slot so a brief background gap is tolerated
    if (delta < 0 || delta > 30 * 60 * 1000) continue;
    spon.fired.push(time);
    saveSpon(spon);
    void fireCheckIn();
    return; // at most one per tick
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
          icon: NOTIFY_ICON,
          badge: NOTIFY_BADGE,
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

/** If the user wants check-ins but the OS/browser revoked permission, nudge
 *  them once so they know why notifications went quiet. */
let warnedRevoked = false;
function maybeWarnRevoked(): void {
  if (warnedRevoked) return;
  const settings = useStore.getState().settings;
  if (settings.checkInsEnabled && permissionStatus() === "denied") {
    warnedRevoked = true;
    toast("Notifications are blocked. Re-enable them to keep getting check-ins.", "loss");
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
  maybeRunWeekly();
  maybeWarnRevoked();
  void scheduleAll();
  void scheduleTaskReminders();
  void syncPush();
  initEventPings();

  // Poll while the app is open.
  window.setInterval(() => {
    maybeRunDue();
    maybeRunWeekly();
    maybeRunSpontaneous();
  }, TICK_MS);

  // Re-evaluate when the tab becomes visible.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      maybeRunDue();
      maybeRunWeekly();
      maybeWarnRevoked();
      maybeRunSpontaneous();
      void scheduleAll();
      void scheduleTaskReminders();
      void syncPush();
    }
  });

  // Reschedule whenever check-in settings change.
  let prev: Settings = useStore.getState().settings;
  useStore.subscribe((s) => {
    if (
      s.settings.checkInsEnabled !== prev.checkInsEnabled ||
      s.settings.checkInTimes !== prev.checkInTimes ||
      s.settings.pushUrl !== prev.pushUrl ||
      s.settings.spontaneousEnabled !== prev.spontaneousEnabled ||
      s.settings.spontaneousCount !== prev.spontaneousCount ||
      s.settings.spontaneousStart !== prev.spontaneousStart ||
      s.settings.spontaneousEnd !== prev.spontaneousEnd
    ) {
      prev = s.settings;
      void scheduleAll();
      void syncPush();
    }
  });

  // Reschedule task reminders whenever the task list changes.
  let prevTasks = useStore.getState().state.tasks;
  useStore.subscribe((s) => {
    if (s.state.tasks !== prevTasks) {
      prevTasks = s.state.tasks;
      void scheduleTaskReminders();
    }
  });
}
