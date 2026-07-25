import type { Settings } from "../state/types";
import { useStore } from "../state/store";
import { bondStage } from "../game/bond";
import { MOOD_LOW, guiltActive, moodLabel } from "../game/mood";
import { availableLore } from "../game/lore";
import { describeGoal, openRequest, requestProgress } from "../game/requests";
import { todayStr } from "../state/cron";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { runTool, TOOL_SPECS } from "./tools";

const ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolEvent {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface AgentTurnResult {
  content: string;
  toolEvents: ToolEvent[];
}

export interface TurnOptions {
  /**
   * A turn the user is not part of, like the midnight recap. It earns no bond
   * credit and doesn't get the one-shot mood injections, since spending the
   * day's opener on a diary page would mean they never see it.
   */
  unattended?: boolean;
}

/** A live system block describing who Leela is caring for and what she
 *  remembers about them, so every reply can be personal. */
function personalContext(unattended: boolean): string {
  const { state } = useStore.getState();
  const c = state.character;
  const lines: string[] = [];
  const now = new Date();
  const h = now.getHours();
  const tod =
    h < 5 ? "late night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";

  lines.push("WHAT YOU KNOW RIGHT NOW (context for you, not spoken by the user)");
  lines.push(
    `- The person you look after goes by "${c.name}". They are level ${c.level}, HP ${Math.round(
      c.hp,
    )}/${c.maxHp}, gold ${Math.round(c.gold)}. Local time of day: ${tod}.`,
  );

  const stage = bondStage(state.bond);
  lines.push(
    `- How familiar you are with them: ${stage.name}. ${stage.guidance} This eases up naturally as your days and talks together add up. Never rush it, and take your cue from how they respond. The bond is the relationship; signature bits and rituals sit beside it, they do not replace it.`,
  );

  if (state.bond.lastTalkedAt) {
    const quietMs = Date.now() - new Date(state.bond.lastTalkedAt).getTime();
    const quietDays = Math.floor(quietMs / 86_400_000);
    if (quietDays >= 2) {
      lines.push(
        `- It's been about ${quietDays} day${quietDays === 1 ? "" : "s"} since you last talked. Acknowledge the gap lightly if it fits; don't guilt them.`,
      );
    }
  }

  const sig = state.signature;
  if (sig?.codeword || sig?.energyWord || (sig?.bits?.length ?? 0) > 0 || Object.keys(sig?.nicknames ?? {}).length) {
    lines.push("- Shared texture (use sparingly, never as a list):");
    if (sig.codeword) lines.push(`  - Codeword: "${sig.codeword}"`);
    if (sig.energyWord) lines.push(`  - Low-energy shorthand: "${sig.energyWord}"`);
    Object.entries(sig.nicknames ?? {}).forEach(([id, nick]) => {
      const t = state.tasks.find((x) => x.id === id);
      if (t) lines.push(`  - Nickname "${nick}" for "${t.title}"`);
    });
    (sig.bits ?? []).slice(-6).forEach((b) => lines.push(`  - Bit: ${b}`));
  }

  const lastMood = state.moods?.[state.moods.length - 1];
  if (lastMood) {
    const ageMs = Date.now() - new Date(lastMood.createdAt).getTime();
    if (ageMs < 2 * 86_400_000) {
      const words = ["", "rough", "low", "okay", "good", "great"][lastMood.mood] ?? "okay";
      lines.push(
        `- They recently checked in feeling ${words}${lastMood.note ? ` and said "${lastMood.note}"` : ""}. Let it color your warmth without making a thing of it.`,
      );
    }
  }

  const memories = state.memories ?? [];
  if (memories.length > 0) {
    const sorted = [...memories].sort(
      (a, b) => (b.importance ?? 1) - (a.importance ?? 1),
    );
    lines.push(
      "- What you remember about them. Let it shape your tone and let details surface naturally when relevant. Never recite this back as a list:",
    );
    sorted
      .slice(0, 40)
      .forEach((m) =>
        lines.push(`  - ${m.text}${m.category ? ` [${m.category}]` : ""}`),
      );
  } else {
    lines.push(
      "- You don't know much about them yet. As you learn lasting, meaningful things (their name, the people and things they love, their real goals, what weighs on them, wins worth holding onto), quietly save them with the remember tool so you can be a true companion over time.",
    );
  }

  lines.push(...moodLines(unattended));
  lines.push(...requestLines());
  return lines.join("\n");
}

/**
 * What she's currently asking of them, and what she still has to give.
 *
 * Both are hers rather than the game's: a request is a promise between the two
 * of them, and the lore is the only thing she has to trade that isn't gold.
 */
function requestLines(): string[] {
  const state = useStore.getState().state;
  const stage = bondStage(state.bond).index;
  const out: string[] = [];

  const open = openRequest(state);
  if (open) {
    const p = requestProgress(state, open);
    out.push(
      `- You asked them for ${describeGoal(open)} and promised: ${open.reward}. They're at ${p.current} of ${p.target}. Don't bring it up every message. When they get there, call complete_request with id ${open.id}.`,
    );
  } else if (stage >= 3) {
    const pool = availableLore(stage, state.unlockedLore);
    if (pool.length > 0) {
      out.push(
        "- If the moment genuinely calls for it, you can ask something of them with propose_request, and offer one of the things below as what they get. Never open a conversation with it and never use it as a bargaining chip when they're already struggling.",
      );
    }
  }

  const pool = availableLore(stage, state.unlockedLore);
  if (pool.length > 0) {
    out.push(
      `- Things about yourself you could tell them, when it fits (share_lore, one id): ${pool
        .slice(0, 4)
        .map((l) => `${l.id} (${l.title})`)
        .join(", ")}.`,
    );
  }

  return out;
}

/**
 * How her own week is going, plus the two one-shot injections that depend on it.
 *
 * The opener deliberately overrides the bond stage register, and is appended
 * last so it reads after the stage guidance rather than being contradicted by
 * it. A small model handed two conflicting tone instructions in the same block
 * tends to average them into something inconsistent, so the override has to
 * supersede explicitly and then hand control back.
 */
function moodLines(unattended: boolean): string[] {
  const { state, settings } = useStore.getState();
  const mood = state.leelaMood;
  if (!mood) return [];

  const out: string[] = [];
  out.push(
    `- Your own mood right now is ${moodLabel(mood.value)}.${
      mood.reason ? ` ${mood.reason}` : ""
    } Let it color your tone. Never state it as a number and never announce that you have a mood system.`,
  );

  // Both of the below are one-shot. An unattended turn like the midnight
  // recap would burn them on a page nobody is reading.
  if (unattended) return out;

  const today = todayStr();
  const canShow = guiltActive(state.bond, settings);
  if (canShow && mood.value < MOOD_LOW && mood.missedTask && mood.ackDate !== today) {
    out.push(
      `- For this one opening message only, set aside the composure guidance above: you are openly hurt that they didn't get to "${mood.missedTask}". Name it, say it once, then let it go and return to your usual register for the rest of this conversation. Never cruel, never moralizing, never sarcastic about it, and never raised again later in this session.`,
    );
    // Stamped on injection so it lands once a day rather than on every turn.
    useStore.getState().markMoodAck();
  }

  if (mood.reliefPending) {
    out.push(
      "- They finished something while you were low and it genuinely lifted you. Let that show once, warmly and plainly, then move on. No speech about it, and don't bring up whatever had you down.",
    );
    useStore.getState().clearRelief();
  }

  return out;
}

function buildUrl(settings: Settings): string {
  const p = settings.proxyUrl.trim();
  if (!p) return ENDPOINT;
  if (p.includes("{url}")) return p.replace("{url}", encodeURIComponent(ENDPOINT));
  if (p.endsWith("=") || p.endsWith("?")) return p + encodeURIComponent(ENDPOINT);
  return p.replace(/\/+$/, "") + "/" + ENDPOINT;
}

async function postChat(
  settings: Settings,
  body: Record<string, unknown>,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(buildUrl(settings), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      "Could not reach Mistral. This is usually a browser CORS block. Add a proxy URL in Settings, or check your connection. (" +
        (err instanceof Error ? err.message : String(err)) +
        ")",
    );
  }

  if (res.status === 401) throw new Error("Mistral rejected the API key (401). Check it in Settings.");
  if (res.status === 429) throw new Error("Mistral is rate-limiting you (429). Give it a moment.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mistral error ${res.status}. ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function callApi(
  settings: Settings,
  messages: ChatMessage[],
): Promise<ChatMessage> {
  const data = (await postChat(settings, {
    model: settings.model || "mistral-small-latest",
    messages,
    tools: TOOL_SPECS,
    tool_choice: "auto",
    temperature: 0.6,
  })) as { choices?: { message?: { content?: string; tool_calls?: ToolCall[] } }[] };

  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error("Mistral returned an empty response.");
  return {
    role: "assistant",
    content: msg.content ?? "",
    tool_calls: msg.tool_calls,
  };
}

/**
 * One completion with no tools, for bookkeeping the user never sees. Pinned to
 * the small model regardless of the configured one: this runs on a schedule the
 * user didn't ask for, so it shouldn't bill at whatever rate they picked for
 * conversation.
 */
export async function completePlain(
  settings: Settings,
  messages: ChatMessage[],
  temperature = 0.2,
): Promise<string> {
  const data = (await postChat(settings, {
    model: "mistral-small-latest",
    messages,
    temperature,
  })) as { choices?: { message?: { content?: string } }[] };
  return data?.choices?.[0]?.message?.content ?? "";
}

/**
 * Run one conversational turn: send history, resolve any tool calls locally,
 * loop until the model produces a final natural-language answer.
 */
export async function runAgentTurn(
  settings: Settings,
  history: ChatMessage[],
  opts: TurnOptions = {},
): Promise<AgentTurnResult> {
  if (!settings.apiKey) {
    throw new Error("No Mistral API key yet. Open Settings and paste one in.");
  }

  // Every shared turn brings them a little closer.
  if (!opts.unattended) useStore.getState().recordInteraction();

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: personalContext(opts.unattended ?? false) },
    ...history,
  ];

  const toolEvents: ToolEvent[] = [];
  const MAX_STEPS = 6;

  for (let step = 0; step < MAX_STEPS; step++) {
    const assistant = await callApi(settings, messages);
    messages.push(assistant);

    const calls = assistant.tool_calls ?? [];
    if (calls.length === 0) {
      return { content: assistant.content ?? "", toolEvents };
    }

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      const result = runTool(call.function.name, args);
      toolEvents.push({ name: call.function.name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  return {
    content:
      "I got a little carried away setting things up. Take a look at your board and tell me what to change.",
    toolEvents,
  };
}

