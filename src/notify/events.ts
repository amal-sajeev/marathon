// Local (client-side) notifications for meaningful in-app moments, fired only
// when the tab is hidden - when the app is foregrounded the toast system
// already surfaces these. Wired from initNotifications().
import { useStore } from "../state/store";
import { isDailyActiveOn, todayStr } from "../state/cron";
import type { Daily, GameState, Reward, Settings } from "../state/types";
import { permissionStatus } from "./notifications";

const NOTIFY_ICON = "icons/notify-192.png";
const NOTIFY_BADGE = "icons/badge-72.png";
const LOW_HP_FRACTION = 0.2;
const DAILY_LATE_HOUR = 20; // 8pm local: nudge if dailies still open

let started = false;

async function ping(title: string, body: string, tag: string): Promise<void> {
  if (permissionStatus() !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      tag,
      icon: NOTIFY_ICON,
      badge: NOTIFY_BADGE,
      data: { type: "reminder" },
    });
  } catch {
    /* best-effort */
  }
}

function openAffordableRewards(state: GameState): number {
  const gold = state.character.gold;
  return state.tasks.filter((t) => t.type === "reward" && (t as Reward).cost <= gold).length;
}

function openDailies(state: GameState, now: Date): number {
  return state.tasks.filter(
    (t) => t.type === "daily" && isDailyActiveOn(t as Daily, now) && !(t as Daily).done,
  ).length;
}

export function initEventPings(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  let prev: GameState = useStore.getState().state;
  let lateDailyDay = ""; // dedupe the "dailies still open" nudge per day

  useStore.subscribe((s) => {
    const cur = s.state;
    if (cur === prev) return;
    const settings: Settings = s.settings;
    const canPing = settings.checkInsEnabled; // reuse the same opt-in
    const hidden = document.visibilityState !== "visible";

    if (canPing && hidden) {
      // Level up
      if (cur.character.level > prev.character.level) {
        void ping(
          "Level up",
          `You reached level ${cur.character.level}. Nicely done.`,
          "event-level",
        );
      }

      // Streak milestone (every 7 days)
      const ps = prev.stats.currentStreak;
      const cs = cur.stats.currentStreak;
      if (cs > ps && cs % 7 === 0) {
        void ping("Streak milestone", `${cs}-day streak. That's real momentum.`, "event-streak");
      }

      // Low HP warning (crossing below the threshold)
      const pf = prev.character.hp / prev.character.maxHp;
      const cf = cur.character.hp / cur.character.maxHp;
      if (cf < LOW_HP_FRACTION && pf >= LOW_HP_FRACTION && cur.character.hp > 0) {
        void ping("HP running low", "Ease up and clear something small to recover.", "event-hp");
      }

      // A reward just became affordable
      if (openAffordableRewards(cur) > openAffordableRewards(prev)) {
        void ping("Reward unlocked", "You've got enough gold to treat yourself.", "event-reward");
      }
    }

    prev = cur;
  });

  // Time-based: dailies still open late in the day, checked on a slow timer.
  window.setInterval(() => {
    const s = useStore.getState();
    if (!s.settings.checkInsEnabled) return;
    if (document.visibilityState === "visible") return;
    const now = new Date();
    if (now.getHours() < DAILY_LATE_HOUR) return;
    const today = todayStr(now);
    if (lateDailyDay === today) return;
    const open = openDailies(s.state, now);
    if (open > 0) {
      lateDailyDay = today;
      void ping(
        "Dailies still open",
        `${open} daily${open === 1 ? "" : "s"} left today. A quick sweep keeps the streak alive.`,
        "event-late-daily",
      );
    }
  }, 5 * 60 * 1000);
}
