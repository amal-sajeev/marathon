import { useState } from "react";
import { useStore } from "../state/store";

const SEEN_KEY = "rpgtask:welcomed";

export function Welcome() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(SEEN_KEY) === "1",
  );
  const setChatOpen = useStore((s) => s.setChatOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const hasTasks = useStore((s) => s.state.tasks.length > 0);

  if (dismissed || hasTasks) return null;

  const done = () => {
    localStorage.setItem(SEEN_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className="scrim"
      style={{
        zIndex: 45,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="sheet"
        style={{
          position: "relative",
          margin: 0,
          maxWidth: 460,
          width: "100%",
          borderRadius: 20,
          animation: "pop 0.3s ease",
        }}
      >
        <div className="welcome">
          <img className="welcome__crest" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" />
          <div className="welcome__title">Welcome to RPGtask</div>
          <div className="welcome__text">
            This is your quest board. Finish real-life tasks, earn XP and gold,
            level up. The best part: you don't have to invent the quests. Your
            companion will pull them out of you and set them up.
          </div>
          <div className="welcome__actions">
            <button
              className="btn btn--primary"
              onClick={() => {
                done();
                setSettingsOpen(true);
              }}
            >
              Add my Mistral key, then meet my companion
            </button>
            <button
              className="btn"
              onClick={() => {
                done();
                setChatOpen(true);
              }}
            >
              Open the companion now
            </button>
            <button className="btn btn--ghost btn--sm" onClick={done}>
              I'll just add tasks myself
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
