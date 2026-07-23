import type { Settings } from "../state/types";
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

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
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
