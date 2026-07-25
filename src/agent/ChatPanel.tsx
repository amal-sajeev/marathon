import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { AssetImage } from "../components/AssetImage";
import { Markdown } from "../components/Markdown";
import { runAgentTurn } from "./mistral";
import { buildConversationHistory } from "./summarize";
import { nextId, useChat, type NewMessage } from "./chatStore";
import { FaceAvatar } from "./FaceAvatar";
import { RankBadge } from "../components/RankBadge";
import { runNightlyDebrief } from "./checkin";
import { extractEmotion, type Emotion } from "./emotions";

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
  remember: "held onto something",
  update_memory: "revised a memory",
  forget_memory: "let a memory go",
  list_memories: "recalled what she knows",
  uncomplete_task: "un-checked a task",
  set_reminder: "set a reminder",
  edit_checklist: "edited a checklist",
  rename_adventurer: "renamed you",
  claim_daily_gift: "left you a gift",
  schedule_followup: "made a note to follow up",
  list_followups: "checked her follow-ups",
  complete_followup: "closed a follow-up",
  set_codeword: "set a codeword",
  set_energy_word: "set an energy word",
  set_task_nickname: "named a quest",
  add_bit: "saved a shared bit",
  list_signature: "checked your shared bits",
  add_keepsake: "left a keepsake",
  write_sunday_letter: "wrote a Sunday letter",
};

const QUICK_PROMPTS = [
  "Help me build a morning routine",
  "I want to get in shape",
  "Set me up for a productive workday",
  "Give me some rewards to work toward",
];

// Minimal typing for the (prefixed) Web Speech API.
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function ChatPanel() {
  const open = useStore((s) => s.chatOpen);
  const setOpen = useStore((s) => s.setChatOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setMoodOpen = useStore((s) => s.setMoodOpen);
  const settings = useStore((s) => s.settings);
  const lastDebrief = useStore((s) => s.state.engagement.lastDebriefDate);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const evening = today.getHours() >= 20;
  const canDebrief =
    !!settings.nightlyDebrief &&
    evening &&
    lastDebrief !== todayKey &&
    !!settings.apiKey;

  const messages = useChat((s) => s.messages);
  const busy = useChat((s) => s.busy);
  const add = useChat((s) => s.add);
  const setBusy = useChat((s) => s.setBusy);
  const level = useStore((s) => s.state.character.level);

  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const canVoice = getSpeechRecognitionCtor() !== null;

  const toggleMic = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  useEffect(() => {
    return () => recRef.current?.stop();
  }, []);

  useEffect(() => {
    if (open && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, open, busy]);

  const latestEmotion = useMemo<Emotion>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].emotion ?? "neutral";
    }
    return "neutral";
  }, [messages]);

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  if (!open) return null;

  // Her profile picture "thinks" while she's composing a reply.
  const faceEmotion: Emotion = busy ? "thinking" : latestEmotion;

  const send = async (raw: string) => {
    const content = raw.trim();
    if (!content || busy) return;
    setText("");

    const userMsg: NewMessage = { id: nextId(), role: "user", content };
    add(userMsg);

    setBusy(true);
    try {
      const result = await runAgentTurn(
        settings,
        await buildConversationHistory(settings),
      );
      const { emotion, text, chips } = extractEmotion(result.content || "");
      add({
        id: nextId(),
        role: "assistant",
        content: text || "(done)",
        toolEvents: result.toolEvents,
        emotion,
        chips,
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
          <span className="chat__headline">
            <span className="chat__headicon">
              <FaceAvatar emotion={faceEmotion} />
            </span>
            <span className="sheet__title">Leela</span>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {canDebrief && (
              <button
                className="icon-btn"
                onClick={() => void runNightlyDebrief()}
                aria-label="Nightly debrief"
                title="Nightly debrief"
              >
                {"\u263D"}
              </button>
            )}
            <button
              className="icon-btn"
              onClick={() => setMoodOpen(true)}
              aria-label="Log your mood"
            >
              {"\u2661"}
            </button>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
              {"\u2715"}
            </button>
          </div>
        </div>

        <div className="chat__body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="chat__intro">
              <div className="chat__portrait">
                <AssetImage slot="agentIcon" />
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

          {messages.map((m) => {
            if (m.role === "error") {
              return (
                <div key={m.id} className="msg msg--error">
                  {m.content}
                </div>
              );
            }
            return (
              <div key={m.id} className={`msg-row msg-row--${m.role}`}>
                <div className="msg-row__avatar">
                  {m.role === "assistant" ? (
                    <span className="msg-av msg-av--leela">
                      <FaceAvatar emotion={faceEmotion} />
                    </span>
                  ) : (
                    <span className="msg-av msg-av--user">
                      <RankBadge level={level} size={36} />
                    </span>
                  )}
                </div>
                <div className={`msg ${m.role === "user" ? "msg--user" : "msg--agent"}`}>
                  {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
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
              </div>
            );
          })}

          {busy && (
            <div className="msg-row msg-row--assistant">
              <div className="msg-row__avatar">
                <span className="msg-av msg-av--leela">
                  <FaceAvatar emotion={faceEmotion} />
                </span>
              </div>
              <div className={`typing typing--${faceEmotion}`}>
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          {!busy &&
            (() => {
              const last = messages.find((m) => m.id === lastAssistantId);
              const chips = last?.chips;
              if (!chips || chips.length === 0) return null;
              return (
                <div className="chat__chips">
                  {chips.map((c) => (
                    <button key={c} className="chip-reply" onClick={() => void send(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              );
            })()}
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
            {canVoice && (
              <button
                className={`btn btn--round ${listening ? "btn--primary mic--on" : "btn--ghost"}`}
                onClick={toggleMic}
                aria-label={listening ? "Stop dictation" : "Dictate"}
                title="Voice input"
              >
                {"\u{1F3A4}"}
              </button>
            )}
            <textarea
              className="chat__input"
              value={text}
              rows={1}
              placeholder={listening ? "Listening..." : "Tell me what you want to get done..."}
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
