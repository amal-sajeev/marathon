// Keeps long conversations inside the context window without giving Leela
// amnesia. Rather than dropping old messages, everything above a verbatim tail
// is folded into a running précis that travels with every request.
import type { Settings } from "../state/types";
import { completePlain, type ChatMessage } from "./mistral";
import { useChat, type VisibleMessage } from "./chatStore";

/** How many recent messages always go through word-for-word. */
const TAIL = 8;
/** Don't spend a call until at least this many messages are waiting above the tail. */
const CHUNK = 6;
/** Keep the précis itself from growing without bound. */
const MAX_SUMMARY_CHARS = 1600;

const SUMMARY_SYSTEM = `You compress a conversation log into notes that will be handed back to the assistant as memory of what was already said.

Write a factual précis in the third person, under 180 words. Refer to the two sides as "the user" and "the assistant".

Keep: things the user revealed about themselves, decisions and commitments either side made, tasks or plans discussed, questions left open, and the emotional shape of the conversation.

Drop: pleasantries, repetition, and anything already obvious from the task board.

Do not roleplay, do not write in the assistant's voice, do not offer advice, and do not invent anything that was not said. Output only the précis.`;

/** True while a summarization request is in flight, so turns don't stack them. */
let inFlight = false;

function conversational(messages: VisibleMessage[]): VisibleMessage[] {
  return messages.filter((m) => m.role !== "error");
}

function transcribe(messages: VisibleMessage[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
}

/**
 * Fold anything that has aged past the verbatim tail into the running précis.
 * Best-effort: if the call fails we keep the old summary and carry on, since
 * losing some distant context is a far better outcome than failing the turn the
 * user is actually waiting on.
 */
async function ensureSummary(settings: Settings): Promise<void> {
  if (inFlight || !settings.apiKey) return;

  const { messages, summary, summarizedThrough } = useChat.getState();
  const usable = conversational(messages);
  if (usable.length <= TAIL) return;

  const older = usable.slice(0, -TAIL);
  // A summarizedThrough that's no longer present means the transcript was
  // pruned beneath us; -1 + 1 == 0 restarts from the oldest message we still
  // hold, which is the right fallback.
  const start = summarizedThrough
    ? older.findIndex((m) => m.id === summarizedThrough) + 1
    : 0;
  const pending = older.slice(start);
  if (pending.length < CHUNK) return;

  const prompt = summary
    ? `Existing notes on the earlier part of this conversation:\n\n${summary}\n\nThe conversation then continued:\n\n${transcribe(pending)}\n\nRewrite the notes so they cover the whole conversation, still under 180 words.`
    : `Conversation to compress:\n\n${transcribe(pending)}`;

  const request: ChatMessage[] = [
    { role: "system", content: SUMMARY_SYSTEM },
    { role: "user", content: prompt },
  ];

  inFlight = true;
  try {
    const next = (await completePlain(settings, request)).trim();
    if (next) {
      useChat
        .getState()
        .setSummary(next.slice(0, MAX_SUMMARY_CHARS), pending[pending.length - 1].id);
    }
  } catch {
    /* keep the previous summary; the turn continues on the tail alone */
  } finally {
    inFlight = false;
  }
}

/**
 * The conversation as the model should see it: a précis of the distant past,
 * then the recent messages verbatim.
 */
export async function buildConversationHistory(
  settings: Settings,
): Promise<ChatMessage[]> {
  await ensureSummary(settings);

  const { messages, summary } = useChat.getState();
  const tail = conversational(messages).slice(-TAIL);

  const out: ChatMessage[] = [];
  if (summary) {
    out.push({
      role: "system",
      content: `EARLIER IN THIS CONVERSATION\nNotes on what was said before the messages below. You lived it, so treat it as your own memory rather than something you were told, and don't mention that a summary exists.\n\n${summary}`,
    });
  }
  for (const m of tail) {
    out.push({ role: m.role as "user" | "assistant", content: m.content });
  }
  return out;
}
