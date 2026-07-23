import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { AssetImage } from "../components/AssetImage";
import { Markdown } from "../components/Markdown";
import { runAgentTurn, toApiHistory, type ChatMessage } from "./mistral";
import { nextId, useChat, type VisibleMessage } from "./chatStore";

const TOOL_VERB: Record<string, string> = {
  add_habit: "added a habit",
  add_daily: "set a daily",
  add_todo: "added a to-do",
  add_reward: "made a reward",
  update_task: "tweaked a task",
  delete_task: "removed a task",
  list_tasks: "checked your board",
  get_character: "read your stats",
  complete_daily: "checked off a daily",
  complete_todo: "checked off a to-do",
  score_habit: "logged a habit",
};

const QUICK_PROMPTS = [
  "Help me build a morning routine",
  "I want to get in shape",
  "Set me up for a productive workday",
  "Give me some rewards to work toward",
];

export function ChatPanel() {
  const open = useStore((s) => s.chatOpen);
  const setOpen = useStore((s) => s.setChatOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);

  const messages = useChat((s) => s.messages);
  const busy = useChat((s) => s.busy);
  const add = useChat((s) => s.add);
  const setBusy = useChat((s) => s.setBusy);

  const [text, setText] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, open, busy]);

  if (!open) return null;

  const send = async (raw: string) => {
    const content = raw.trim();
    if (!content || busy) return;
    setText("");

    const history: { role: "user" | "assistant"; content: string }[] = messages
      .filter((m) => m.role !== "error")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const userMsg: VisibleMessage = { id: nextId(), role: "user", content };
    add(userMsg);

    const apiHistory: ChatMessage[] = toApiHistory([
      ...history,
      { role: "user", content },
    ]);

    setBusy(true);
    try {
      const result = await runAgentTurn(settings, apiHistory);
      add({
        id: nextId(),
        role: "assistant",
        content: result.content || "(done)",
        toolEvents: result.toolEvents,
      });
    } catch (err) {
      add({
        id: nextId(),
        role: "error",
        content: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const needsKey = !settings.apiKey;

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="sheet chat">
        <div className="sheet__grip" />
        <div className="sheet__head">
          <span className="sheet__title">Your Companion</span>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            {"\u2715"}
          </button>
        </div>

        <div className="chat__body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="chat__intro">
              <div className="chat__portrait">
                <AssetImage slot="agentPortrait" />
              </div>
              <div>
                {needsKey ? (
                  <>
                    We haven't been introduced to Mistral yet. Drop an API key in
                    Settings and I'll start building your quests.
                  </>
                ) : (
                  <>
                    So. What are we taking on? Tell me a goal or a mess you want
                    tamed, and I'll turn it into something you can actually check
                    off.
                  </>
                )}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`msg ${
                m.role === "user"
                  ? "msg--user"
                  : m.role === "error"
                    ? "msg--error"
                    : "msg--agent"
              }`}
            >
              {m.role === "assistant" ? (
                <Markdown text={m.content} />
              ) : (
                m.content
              )}
              {m.toolEvents && m.toolEvents.length > 0 && (
                <div className="msg__tools">
                  {m.toolEvents.map((e, i) => (
                    <div key={i} className="msg__tool">
                      <span>{"\u2726"}</span>
                      <span>
                        {TOOL_VERB[e.name] ?? e.name}
                        {typeof e.result?.created === "object" &&
                        e.result.created
                          ? `: ${(e.result.created as { title?: string }).title ?? ""}`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="typing">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>

        {messages.length === 0 && !needsKey && (
          <div className="chat__quick">
            {QUICK_PROMPTS.map((q) => (
              <button key={q} className="quick" onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}

        {needsKey ? (
          <div className="chat__compose">
            <button
              className="btn btn--primary"
              style={{ flex: 1 }}
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
            >
              Open Settings
            </button>
          </div>
        ) : (
          <div className="chat__compose">
            <textarea
              className="chat__input"
              value={text}
              rows={1}
              placeholder="Tell me what you want to get done..."
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
            />
            <button
              className="btn btn--primary btn--round"
              onClick={() => void send(text)}
              disabled={busy || !text.trim()}
              aria-label="Send"
            >
              {"\u2191"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
