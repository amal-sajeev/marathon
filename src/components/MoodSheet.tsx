import { useState } from "react";
import { useStore } from "../state/store";
import { runUserMessage } from "../agent/checkin";

const LABELS = ["", "Rough", "Low", "Okay", "Good", "Great"];

export function MoodSheet() {
  const open = useStore((s) => s.moodOpen);
  const setOpen = useStore((s) => s.setMoodOpen);
  const addMood = useStore((s) => s.addMood);
  const hasKey = useStore((s) => !!s.settings.apiKey);

  const [mood, setMood] = useState(3);
  const [note, setNote] = useState("");

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setMood(3);
    setNote("");
  };

  const save = (talk: boolean) => {
    addMood(mood, note);
    const label = LABELS[mood] ?? "okay";
    close();
    if (talk && hasKey) {
      const line = note.trim()
        ? `Quick mood check-in: I'm feeling ${label.toLowerCase()} today. ${note.trim()}`
        : `Quick mood check-in: I'm feeling ${label.toLowerCase()} today.`;
      void runUserMessage(line);
    }
  };

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="sheet">
        <div className="sheet__grip" />
        <div className="sheet__head">
          <span className="sheet__title">How are you?</span>
          <button className="icon-btn" onClick={close} aria-label="Close">
            {"\u2715"}
          </button>
        </div>

        <div className="sheet__body">
          <div className="mood-row">
            {[1, 2, 3, 4, 5].map((m) => (
              <button
                key={m}
                className={`mood-dot ${mood === m ? "mood-dot--on" : ""} mood-dot--${m}`}
                onClick={() => setMood(m)}
                aria-label={LABELS[m]}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="mood-label">{LABELS[mood]}</div>

          <div className="field" style={{ marginTop: 12 }}>
            <label className="field__label">Anything on your mind? (optional)</label>
            <textarea
              className="textarea"
              value={note}
              placeholder="A word or two, if you want"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="form-actions">
            <button className="btn" onClick={() => save(false)} style={{ flex: 1 }}>
              Just log it
            </button>
            <button
              className="btn btn--primary"
              onClick={() => save(true)}
              disabled={!hasKey}
              style={{ flex: 2 }}
            >
              Log and tell Leela
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
