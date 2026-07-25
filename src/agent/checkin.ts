import { useStore } from "../state/store";
import { isDailyActiveOn, shiftDays, todayStr } from "../state/cron";
import { withDiaryDate } from "./tools";
import type { Daily, DayRecord, Habit, Todo } from "../state/types";
import { runAgentTurn, type ChatMessage } from "./mistral";
import { nextId, useChat } from "./chatStore";
import { extractEmotion } from "./emotions";
import { softPredictions } from "./predictions";
import { buildConversationHistory } from "./summarize";

const CHECKIN_DIRECTIVE = `[AUTOMATED CHECK-IN]
This is a scheduled check-in you initiated, not a reply to the user. Open a short, natural conversation to help them stay on track. Stay fully in character.

Cover these, spread across 3 to 5 SHORT, separate messages (do not cram it into one block):
1. Ask if there is anything new they want to add (a task, habit, daily, or reward).
2. Ask what they got done or finished since you last spoke.
3. Ask how their habits are holding up.
4. Ask which of today's active dailies and open to-dos they actually did, and which slipped.
5. If a soft prediction is listed below, raise at most ONE as a proposal (ask first, change only if they agree). Skip if nothing fits.

Rules:
- Separate each message with a line containing only three dashes: ---
- Keep each message to a sentence or two. Conversational, not a checklist dump.
- Do not mark anything done or add anything yet - just ask. When the user replies, use your tools (complete_daily, complete_todo, score_habit, add_*) to record what they tell you.
- Use the state snapshot below to be specific (reference real titles or nicknames), but do not paste it back verbatim.
- If you share a codeword or in-joke, use it lightly once at most.
- End the LAST message (and only that one) with a [[chips: ...]] tag giving two or three honest one-tap answers to whatever you just asked.`;

function timeOfDayLabel(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "late night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

function buildSignatureLines(): string[] {
  const sig = useStore.getState().state.signature;
  if (!sig) return [];
  const lines: string[] = [];
  if (sig.codeword) lines.push(`  - Shared codeword: "${sig.codeword}" (use sparingly, never explain it).`);
  if (sig.energyWord)
    lines.push(`  - Low-energy shorthand: "${sig.energyWord}" (if they use it or seem drained, match it).`);
  const nicks = Object.entries(sig.nicknames ?? {});
  if (nicks.length) {
    lines.push("  - Quest nicknames:");
    nicks.forEach(([id, nick]) => {
      const t = useStore.getState().state.tasks.find((x) => x.id === id);
      if (t) lines.push(`      "${nick}" = ${t.title} [${id}]`);
    });
  }
  if (sig.bits?.length) {
    lines.push("  - Signature bits (weave in at most one if it fits):");
    sig.bits.slice(-8).forEach((b) => lines.push(`      - ${b}`));
  }
  return lines;
}

function buildContext(): string {
  const state = useStore.getState().state;
  const now = new Date();
  const c = state.character;

  const dailies = state.tasks.filter((t) => t.type === "daily") as Daily[];
  const activeDailies = dailies.filter((d) => isDailyActiveOn(d, now));
  const todos = state.tasks.filter((t) => t.type === "todo") as Todo[];
  const habits = state.tasks.filter((t) => t.type === "habit") as Habit[];
  const today = todayStr(now);
  const nicknames = state.signature?.nicknames ?? {};

  const lines: string[] = [];
  lines.push(`STATE SNAPSHOT (today ${today}, ${timeOfDayLabel(now)})`);
  lines.push(`Adventurer: ${c.name}, level ${c.level}, HP ${Math.round(c.hp)}/${c.maxHp}, gold ${Math.round(c.gold)}.`);

  lines.push("Today's dailies:");
  if (activeDailies.length === 0) lines.push("  (none active today)");
  activeDailies.forEach((d) => {
    const nick = nicknames[d.id] ? ` a.k.a. "${nicknames[d.id]}"` : "";
    lines.push(`  - [${d.id}] ${d.title}${nick} - ${d.done ? "done" : "not done"}`);
  });

  lines.push("Open to-dos:");
  const openTodos = todos.filter((t) => !t.done);
  if (openTodos.length === 0) lines.push("  (none)");
  openTodos.forEach((t) => {
    const overdue = t.dueDate && t.dueDate < today ? " (overdue)" : t.dueDate ? ` (due ${t.dueDate})` : "";
    const nick = nicknames[t.id] ? ` a.k.a. "${nicknames[t.id]}"` : "";
    lines.push(`  - [${t.id}] ${t.title}${nick}${overdue}`);
  });

  lines.push("Habits:");
  if (habits.length === 0) lines.push("  (none)");
  habits.forEach((h) => {
    const nick = nicknames[h.id] ? ` a.k.a. "${nicknames[h.id]}"` : "";
    lines.push(`  - [${h.id}] ${h.title}${nick}`);
  });

  const preds = softPredictions(state, now);
  if (preds.length) {
    lines.push("Soft predictions (raise at most one, as a proposal they can refuse):");
    preds.forEach((p) => lines.push(`  - ${p.note}`));
  }

  const lastMood = state.moods[state.moods.length - 1];
  if (lastMood && daysAgo(lastMood.date) <= 2) {
    const words = ["", "rough", "low", "okay", "good", "great"][lastMood.mood] ?? "okay";
    lines.push(
      `Recent mood: they logged feeling ${words}${lastMood.note ? ` ("${lastMood.note}")` : ""}. Be considerate of it.`,
    );
  }

  const dueFollowups = (state.followups ?? []).filter(
    (f) => !f.done && (!f.dueDate || f.dueDate <= today),
  );
  if (dueFollowups.length) {
    lines.push("You meant to follow up on (raise these naturally, then complete_followup):");
    dueFollowups.forEach((f) => lines.push(`  - [${f.id}] ${f.text}`));
  }

  if (state.engagement?.lastGiftDate !== today) {
    lines.push(
      "You have today's small gift to give them (call claim_daily_gift): offer it warmly, once, near the start.",
    );
  }

  const sigLines = buildSignatureLines();
  if (sigLines.length) {
    lines.push("Your shared texture with them:");
    lines.push(...sigLines);
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

  chat.setBusy(true);
  try {
    const result = await runAgentTurn(
      settings,
      await buildConversationHistory(settings),
    );
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
4. Before you finish, write this week's Sunday letter with write_sunday_letter (a few personal sentences, not a report). Do this once.

Rules:
- Separate each message with a line containing only three dashes: ---
- Keep each message to a sentence or two. Reflective and encouraging, never a report.
- Do not add or change anything yet (except the Sunday letter tool). When they reply, use your tools.
- End the LAST message (and only that one) with a [[chips: ...]] tag offering two or three one-tap answers about what they want next week to look like.`;

const DEBRIEF_DIRECTIVE = `[NIGHTLY DEBRIEF]
This is a short evening ritual you initiated, not a reply to the user. Keep it intimate and brief. Stay fully in character and within your current closeness stage.

Across 2 to 3 SHORT messages:
1. Ask how the day actually felt, not for a task dump.
2. Ask if anything is still nagging them tonight, and offer to park it on the board or set a follow-up.
3. Close with one grounded line. If your bond stage allows, let a little warmth through. Never rush romance.

Rules:
- Separate each message with a line containing only three dashes: ---
- Keep each message to a sentence or two.
- If a soft prediction fits, raise it once as an offer.
- Use nicknames / codeword only if they already exist and it feels natural.
- End the LAST message (and only that one) with a [[chips: ...]] tag. It's late and they're tired, so make answering a single tap: how the day felt, or yes/no to parking something for tomorrow.`;

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
  const eng = state.engagement;
  if (eng?.lastSundayLetter) {
    lines.push(`Last Sunday letter: ${eng.lastSundayLetter}.`);
  } else {
    lines.push("No Sunday letter on file yet.");
  }
  softPredictions(state).forEach((p) => lines.push(`Soft prediction: ${p.note}`));
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

const RECAP_DIRECTIVE = `[MIDNIGHT RECAP]
No one is reading this as a message. You are writing the day's page in your diary, alone, after they've gone.

- Call write_diary exactly once. Two or three sentences, your own voice, addressed to them.
- Name the specific things they actually finished, from the list below. Not a count, the names.
- If they finished nothing, say so honestly. No lecture, no consolation prize.
- Pick the emotion that matches how the day genuinely landed for you.
- Stay inside your current closeness stage. Early pages are observant and dry; warmth arrives only as the bond does, exactly as it would in conversation.
- After the tool call, reply with nothing at all. There is no one to answer.`;

/** What she has to work with when writing a page for a given day. */
function recapContext(date: string): string {
  const state = useStore.getState().state;
  const done: string[] = [];
  for (const t of state.tasks) {
    if (t.type === "daily" && (t as Daily).lastCompletedOn === date) done.push(t.title);
    if (t.type === "todo" && (t as Todo).completedAt?.slice(0, 10) === date) {
      done.push(t.title);
    }
  }

  const lines = [`The day you're writing about: ${date}.`];
  lines.push(
    done.length ? `They finished: ${done.join(", ")}.` : "They finished nothing today.",
  );
  const rec = state.history.find((d: DayRecord) => d.date === date);
  if (rec) lines.push(`Total logged that day, including habits: ${rec.completed}.`);
  if (state.leelaMood?.reason) lines.push(`Where your head is at: ${state.leelaMood.reason}`);
  return lines.join("\n");
}

/** Dates already attempted this session, so a failing key isn't hammered. */
const recapTried = new Set<string>();

async function writeRecapFor(date: string): Promise<void> {
  const store = useStore.getState();
  if (!store.settings.apiKey) return;
  if (recapTried.has(date)) return;
  recapTried.add(date);

  const directive: ChatMessage = {
    role: "user",
    content: `${RECAP_DIRECTIVE}\n\n${recapContext(date)}`,
  };
  try {
    await withDiaryDate(date, () =>
      runAgentTurn(store.settings, [directive], { unattended: true }),
    );
  } catch {
    // A missing page is not worth interrupting anyone over; tomorrow's runs anyway.
  }
}

/**
 * File the day's diary page if it's owed and missing.
 *
 * Late enough in the evening the page for today can be written. Before that,
 * the only thing outstanding is yesterday's, which happens when the app sat
 * closed all evening and through the rollover.
 */
export function maybeWriteRecap(now: Date = new Date(), forDate?: string): void {
  const state = useStore.getState().state;
  const date = forDate ?? (now.getHours() >= 21 ? todayStr(now) : shiftDays(now, -1));

  // Nothing to write about a day that predates the save.
  if (date < todayStr(new Date(state.createdAt))) return;
  if (state.keepsakes.some((k) => k.kind === "diary" && k.date === date)) return;
  if (useChat.getState().busy) return;

  void writeRecapFor(date);
}

/**
 * Short evening ritual. Marks the day as debriefed so it doesn't spam.
 */
export async function runNightlyDebrief(): Promise<void> {
  const store = useStore.getState();
  const chat = useChat.getState();
  if (chat.busy) return;

  store.setChatOpen(true);
  const settings = store.settings;

  if (!settings.apiKey) {
    chat.add({
      id: nextId(),
      role: "assistant",
      content: "I'd sit with you for a proper wind-down, but we still need a Mistral key in Settings.",
    });
    return;
  }

  store.markDebriefDone();
  chat.setBusy(true);
  try {
    const directive: ChatMessage = {
      role: "user",
      content: `${DEBRIEF_DIRECTIVE}\n\n${buildContext()}`,
    };
    const result = await runAgentTurn(settings, [directive]);
    const parts = splitMessages(result.content || "");
    const messages = parts.length ? parts : ["How did today land?"];
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

  // The debrief is the natural end of the day, so the page gets written now
  // rather than waiting on a rollover the app may well sleep through.
  maybeWriteRecap(new Date(), todayStr());
}
