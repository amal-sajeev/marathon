import { useStore } from "./state/store";
import { CharacterBar } from "./components/CharacterBar";
import { TabBar } from "./components/TabBar";
import { Board } from "./components/Board";
import { AddEditSheet } from "./components/AddEditSheet";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toasts } from "./components/Toasts";
import { Celebrate } from "./components/Celebrate";
import { FallenOverlay } from "./components/FallenOverlay";
import { StatsPanel } from "./components/StatsPanel";
import { Welcome } from "./components/Welcome";
import { AssetImage } from "./components/AssetImage";
import { ChatPanel } from "./agent/ChatPanel";

export function App() {
  const ready = useStore((s) => s.ready);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setStatsOpen = useStore((s) => s.setStatsOpen);
  const fileName = useStore((s) => s.fileName);
  const saveStatus = useStore((s) => s.saveStatus);

  if (!ready) {
    return (
      <div className="app">
        <div style={{ margin: "auto", color: "#f0dcb4" }}>Loading your world...</div>
      </div>
    );
  }

  const statusText = fileName
    ? saveStatus === "saving"
      ? `${fileName} - saving...`
      : saveStatus === "error"
        ? `${fileName} - save blocked`
        : `${fileName} - synced`
    : "Saved in this browser";

  return (
    <div className="app">
      <div className="scanline" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px 0",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-title)",
            fontWeight: 800,
            color: "var(--neon-soft)",
            letterSpacing: 2,
            textTransform: "uppercase",
            textShadow: "0 0 12px rgba(56,230,255,0.55)",
          }}
        >
          Marathon
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="icon-btn"
            onClick={() => setStatsOpen(true)}
            aria-label="Service record"
          >
            {"\u25A6"}
          </button>
          <button
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            {"\u2699"}
          </button>
        </div>
      </div>

      <CharacterBar />

      <div className="app__scroll">
        <TabBar />
        <Board />
        <div className="status-line">{statusText}</div>
      </div>

      <button
        className="agent-fab"
        onClick={() => setChatOpen(true)}
        aria-label="Talk to your companion"
      >
        <AssetImage slot="agentAvatar" />
      </button>

      <Toasts />
      <Celebrate />
      <FallenOverlay />
      <ChatPanel />
      <SettingsPanel />
      <StatsPanel />
      <AddEditSheet />
      <Welcome />
    </div>
  );
}
