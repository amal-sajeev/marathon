import type { Settings } from "../state/types";
import { useStore } from "../state/store";
import { bondStage } from "../game/bond";
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

/** A live system block describing who Leela is caring for and what she
 *  remembers about them, so every reply can be personal. */
function personalContext(): string {
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
  return lines.join("\n");
}

function buildUrl(settings: Settings): string {
  const p = settings.proxyUrl.trim();
  if (!p) return ENDPOINT;
  if (p.includes("{url}")) return p.replace("{url}", encodeURIComponent(ENDPOINT));
  if (p.endsWith("=") || p.endsWith("?")) return p + encodeURIComponent(ENDPOINT);
  return p.replace(/\/+$/, "") + "/" + ENDPOINT;
}

async function callApi(
  settings: Settings,
  messages: ChatMessage[],
): Promise<ChatMessage> {
  let res: Response;
  try {
    res = await fetch(buildUrl(settings), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: settings.model || "mistral-small-latest",
        messages,
        tools: TOOL_SPECS,
        tool_choice: "auto",
        temperature: 0.6,
      }),
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

  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error("Mistral returned an empty response.");
  return {
    role: "assistant",
    content: msg.content ?? "",
    tool_calls: msg.tool_calls,
  };
}

/**
 * Run one conversational turn: send history, resolve any tool calls locally,
 * loop until the model produces a final natural-language answer.
 */
export async function runAgentTurn(
  settings: Settings,
  history: ChatMessage[],
): Promise<AgentTurnResult> {
  if (!settings.apiKey) {
    throw new Error("No Mistral API key yet. Open Settings and paste one in.");
  }

  // Every shared turn brings them a little closer.
  useStore.getState().recordInteraction();

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: personalContext() },
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

/** Strip system/tool bookkeeping down to what the UI shows as a conversation. */
export function toApiHistory(
  visible: { role: "user" | "assistant"; content: string }[],
): ChatMessage[] {
  return visible.map((m) => ({ role: m.role, content: m.content }));
}
