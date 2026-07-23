import { useStore } from "../state/store";
import { isDailyActiveOn, todayStr } from "../state/cron";
import type { Daily, Habit, Todo } from "../state/types";
import { runAgentTurn, type ChatMessage } from "./mistral";
import { nextId, useChat } from "./chatStore";

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
      useChat.getState().add({
        id: nextId(),
        role: "assistant",
        content: messages[i],
        toolEvents: i === 0 ? result.toolEvents : undefined,
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
