import { useStore } from "../state/store";
import { isDailyActiveOn, todayStr } from "../state/cron";
import type { Daily, DayRecord, Habit, Todo } from "../state/types";
import { runAgentTurn, type ChatMessage } from "./mistral";
import { nextId, useChat } from "./chatStore";
import { extractEmotion } from "./emotions";

const CHECKIN_DIRECTIVE = `[AUTOMATED CHECK-IN]
This is a scheduled check-in you initiated, not a reply to the user. Open a short, natural conversation to help them stay on track. Stay fully in character.

Cover these, spread across 3 to 5 SHORT, separate messages (do not cram it into one block):
1. Ask if there is anything new they want to add (a task, habit, daily, or reward).
2. Ask what they got done or finished since you last spoke.
3. Ask how their habits are holding up.
4. Ask which of today's active dailies and open to-dos they actually did, and which slipped.

Rules:
- Separate each message with a line containing only three dashes: ---
- Keep each message to a sentence or two. Conversational, not a checklist dump.
- Do not mark anything done or add anything yet - just ask. When the user replies, use your tools (complete_daily, complete_todo, score_habit, add_*) to record what they tell you.
- Use the state snapshot below to be specific (reference real titles), but do not paste it back verbatim.`;

function buildContext(): string {
  const state = useStore.getState().state;
  const now = new Date();
  const c = state.character;

  const dailies = state.tasks.filter((t) => t.type === "daily") as Daily[];
  const activeDailies = dailies.filter((d) => isDailyActiveOn(d, now));
  const todos = state.tasks.filter((t) => t.type === "todo") as Todo[];
  const habits = state.tasks.filter((t) => t.type === "habit") as Habit[];
  const today = todayStr(now);

  const lines: string[] = [];
  lines.push(`STATE SNAPSHOT (today ${today})`);
  lines.push(`Adventurer: ${c.name}, level ${c.level}, HP ${Math.round(c.hp)}/${c.maxHp}, gold ${Math.round(c.gold)}.`);

  lines.push("Today's dailies:");
  if (activeDailies.length === 0) lines.push("  (none active today)");
  activeDailies.forEach((d) =>
    lines.push(`  - [${d.id}] ${d.title} - ${d.done ? "done" : "not done"}`),
  );

  lines.push("Open to-dos:");
  const openTodos = todos.filter((t) => !t.done);
  if (openTodos.length === 0) lines.push("  (none)");
  openTodos.forEach((t) => {
    const overdue = t.dueDate && t.dueDate < today ? " (overdue)" : t.dueDate ? ` (due ${t.dueDate})` : "";
    lines.push(`  - [${t.id}] ${t.title}${overdue}`);
  });

  lines.push("Habits:");
  if (habits.length === 0) lines.push("  (none)");
  habits.forEach((h) => lines.push(`  - [${h.id}] ${h.title}`));

  // Pattern nudges: things quietly worth raising (without nagging).
  const slipping = activeDailies.filter((d) => d.streak === 0);
  const badHabits = habits.filter((h) => h.countDown > h.countUp && h.countDown >= 2);
  if (slipping.length || badHabits.length) {
    lines.push("Patterns worth a gentle nudge (raise at most one, kindly):");
    slipping.forEach((d) =>
      lines.push(`  - "${d.title}" has lost its streak; maybe offer to ease its schedule.`),
    );
    badHabits.forEach((h) =>
      lines.push(`  - "${h.title}" is trending the wrong way (+${h.countUp}/-${h.countDown}).`),
    );
  }

  const lastMood = state.moods[state.moods.length - 1];
  if (lastMood && daysAgo(lastMood.date) <= 2) {
    const words = ["", "rough", "low", "okay", "good", "great"][lastMood.mood] ?? "okay";
    lines.push(
      `Recent mood: they logged feeling ${words}${lastMood.note ? ` ("${lastMood.note}")` : ""}. Be considerate of it.`,
    );
  }

  // Things you meant to circle back on.
  const dueFollowups = (state.followups ?? []).filter(
    (f) => !f.done && (!f.dueDate || f.dueDate <= today),
  );
  if (dueFollowups.length) {
    lines.push("You meant to follow up on (raise these naturally, then complete_followup):");
    dueFollowups.forEach((f) => lines.push(`  - [${f.id}] ${f.text}`));
  }

  // The daily gift, if one is waiting for them.
  if (state.engagement?.lastGiftDate !== today) {
    lines.push(
      "You have today's small gift to give them (call claim_daily_gift): offer it warmly, once, near the start.",
    );
  }

  return lines.join("\n");
}

function splitMessages(content: string): string[] {
  return content
    .split(/\n\s*-{3,}\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Open the chat and send a single message on the user's behalf (used by the
 * quick mood check-in). Leela replies through the normal turn machinery.
 */
export async function runUserMessage(content: string): Promise<void> {
  const store = useStore.getState();
  const chat = useChat.getState();
  if (chat.busy) return;

  store.setChatOpen(true);
  const settings = store.settings;
  const text = content.trim();
  if (!text) return;

  chat.add({ id: nextId(), role: "user", content: text });

  if (!settings.apiKey) {
    chat.add({
      id: nextId(),
      role: "assistant",
      content:
        "I'd love to talk this through, but we haven't been introduced to Mistral yet. Add an API key in Settings.",
    });
    return;
  }

  const history: ChatMessage[] = useChat
    .getState()
    .messages.filter((m) => m.role !== "error")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  chat.setBusy(true);
  try {
    const result = await runAgentTurn(settings, history);
    const { emotion, text: reply, chips } = extractEmotion(result.content || "");
    useChat.getState().add({
      id: nextId(),
      role: "assistant",
      content: reply || "(here)",
      toolEvents: result.toolEvents,
      emotion,
      chips,
    });
  } catch (err) {
    useChat.getState().add({
      id: nextId(),
      role: "error",
      content: err instanceof Error ? err.message : String(err),
    });
  } finally {
    useChat.getState().setBusy(false);
  }
}

const WEEKLY_DIRECTIVE = `[WEEKLY REVIEW]
This is a scheduled weekly review you initiated, not a reply to the user. Look back over their last seven days using the summary below and have a short, warm reflective conversation.

Cover these across 3 to 4 SHORT, separate messages:
1. Name one real thing that went well this week, specific to their data.
2. Gently flag one pattern worth attention (a habit slipping, dailies often missed), without lecturing.
3. Ask what they want next week to look like, and offer to set up a quest or two toward it.

Rules:
- Separate each message with a line containing only three dashes: ---
- Keep each message to a sentence or two. Reflective and encouraging, never a report.
- Do not add or change anything yet. When they reply, use your tools.`;

/** Days elapsed since a yyyy-mm-dd date string. */
function daysAgo(date: string): number {
  const then = new Date(date + "T00:00:00").getTime();
  if (Number.isNaN(then)) return 999;
  return Math.floor((Date.now() - then) / 86_400_000);
}

function buildWeeklyContext(): string {
  const state = useStore.getState().state;
  const history: DayRecord[] = (state.history ?? []).filter((d) => daysAgo(d.date) < 7);
  const totalCompleted = history.reduce((n, d) => n + d.completed, 0);
  const totalXp = history.reduce((n, d) => n + d.xp, 0);
  const activeDays = history.filter((d) => d.completed > 0).length;

  const habits = state.tasks.filter((t) => t.type === "habit") as Habit[];
  const dailies = state.tasks.filter((t) => t.type === "daily") as Daily[];

  const lines: string[] = [];
  lines.push(`WEEK SUMMARY (as of ${todayStr()})`);
  lines.push(
    `Completed ${totalCompleted} things across ${activeDays} active day${activeDays === 1 ? "" : "s"}, earning about ${Math.round(totalXp)} XP.`,
  );
  lines.push(`Current day-streak: ${state.stats.currentStreak}. Longest: ${state.stats.longestStreak}.`);
  if (habits.length) {
    lines.push("Habits (lifetime +/-):");
    habits.forEach((h) => lines.push(`  - ${h.title}: +${h.countUp} / -${h.countDown}`));
  }
  const wobbly = dailies.filter((d) => d.streak === 0);
  if (wobbly.length) {
    lines.push("Dailies with no current streak: " + wobbly.map((d) => d.title).join(", ") + ".");
  }
  return lines.join("\n");
}

/** Run a reflective weekly review with Leela. */
export async function runWeeklyReview(): Promise<void> {
  const store = useStore.getState();
  const chat = useChat.getState();
  if (chat.busy) return;

  store.setChatOpen(true);
  const settings = store.settings;
  if (!settings.apiKey) {
    chat.add({
      id: nextId(),
      role: "assistant",
      content: "I'd do a proper week-in-review, but we still need a Mistral API key in Settings.",
    });
    return;
  }

  chat.setBusy(true);
  try {
    const directive: ChatMessage = {
      role: "user",
      content: `${WEEKLY_DIRECTIVE}\n\n${buildWeeklyContext()}`,
    };
    const result = await runAgentTurn(settings, [directive]);
    const parts = splitMessages(result.content || "");
    const messages = parts.length ? parts : ["Let's look back on your week. How did it feel?"];
    for (let i = 0; i < messages.length; i++) {
      if (i > 0) {
        chat.setBusy(true);
        await delay(700);
      }
      const { emotion, text, chips } = extractEmotion(messages[i]);
      useChat.getState().add({
        id: nextId(),
        role: "assistant",
        content: text,
        toolEvents: i === 0 ? result.toolEvents : undefined,
        emotion,
        chips: i === messages.length - 1 ? chips : undefined,
      });
    }
  } catch (err) {
    useChat.getState().add({
      id: nextId(),
      role: "error",
      content: err instanceof Error ? err.message : String(err),
    });
  } finally {
    useChat.getState().setBusy(false);
  }
}

/**
 * Run a proactive check-in: open the chat and have Leela send a natural
 * sequence of short messages. Answers the user gives afterward flow through
 * the normal chat and are recorded via tools.
 */
export async function runCheckIn(): Promise<void> {
  const store = useStore.getState();
  const chat = useChat.getState();
  if (chat.busy) return;

  store.setChatOpen(true);
  const settings = store.settings;

  if (!settings.apiKey) {
    chat.add({
      id: nextId(),
      role: "assistant",
      content: "Time for a check-in - but we still haven't been introduced to Mistral.",
    });
    chat.add({
      id: nextId(),
      role: "assistant",
      content:
        "Add an API key in Settings and I'll run these properly. For now: look over your board and clear what you can.",
    });
    return;
  }

  chat.setBusy(true);
  try {
    const directive: ChatMessage = {
      role: "user",
      content: `${CHECKIN_DIRECTIVE}\n\n${buildContext()}`,
    };
    const result = await runAgentTurn(settings, [directive]);
    const parts = splitMessages(result.content || "");
    const messages = parts.length ? parts : ["I'm here. How did today go?"];

    for (let i = 0; i < messages.length; i++) {
      if (i > 0) {
        chat.setBusy(true);
        await delay(700);
      }
      const { emotion, text, chips } = extractEmotion(messages[i]);
      useChat.getState().add({
        id: nextId(),
        role: "assistant",
        content: text,
        toolEvents: i === 0 ? result.toolEvents : undefined,
        emotion,
        chips: i === messages.length - 1 ? chips : undefined,
      });
    }
  } catch (err) {
    useChat.getState().add({
      id: nextId(),
      role: "error",
      content: err instanceof Error ? err.message : String(err),
    });
  } finally {
    useChat.getState().setBusy(false);
  }
}
