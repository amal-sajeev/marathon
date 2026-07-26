import { useStore } from "./state/store";
import { CharacterBar } from "./components/CharacterBar";
import { TabBar } from "./components/TabBar";
import { Board } from "./components/Board";
import { AddEditSheet } from "./components/AddEditSheet";
import { SettingsPanel } from "./components/SettingsPanel";
import { Toasts } from "./components/Toasts";
import { Celebrate } from "./components/Celebrate";
import { FallenOverlay } from "./components/FallenOverlay";
import { ServiceRecord } from "./components/ServiceRecord";
import { SuppliesPanel } from "./components/SuppliesPanel";
import { WardrobePanel } from "./components/WardrobePanel";
import { MoodSheet } from "./components/MoodSheet";
import { BondMilestone } from "./components/BondMilestone";
import { Welcome } from "./components/Welcome";
import { ChatPanel } from "./agent/ChatPanel";
import { FaceAvatar } from "./agent/FaceAvatar";
import { useCrack, useRestingFace } from "./agent/useLeelaFace";
import { accentStyle } from "./game/accent";
import { useBondWatcher } from "./game/useBondWatcher";
import { bondStage, stageColor } from "./game/bond";
import { useEffect, type CSSProperties } from "react";

export function App() {
  const ready = useStore((s) => s.ready);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setRecordOpen = useStore((s) => s.setRecordOpen);
  const setSuppliesOpen = useStore((s) => s.setSuppliesOpen);
  const fileName = useStore((s) => s.fileName);
  const saveStatus = useStore((s) => s.saveStatus);
  const cosmetics = useStore((s) => s.state.cosmetics);
  const bond = useStore((s) => s.state.bond);
  // The orb is the only place her mood shows without opening anything, so a
  // day that went badly is visible from the board.
  const restingFace = useRestingFace();
  const crack = useCrack();
  const setAddOpen = useStore((s) => s.setAddOpen);
  useBondWatcher();

  // Home-screen shortcuts route in via a URL hash.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "add" || hash === "chat") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      if (hash === "add") setAddOpen("daily");
      if (hash === "chat") setChatOpen(true);
    }
  }, [setAddOpen, setChatOpen]);

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

  const rootStyle: CSSProperties = {
    ...(accentStyle(cosmetics.accent) ?? {}),
    ["--bond-glow" as string]: stageColor(bondStage(bond).index),
  };

  return (
    <div className="app" style={rootStyle} data-frame={cosmetics.badgeFrame || undefined}>
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
            onClick={() => setSuppliesOpen(true)}
            aria-label="Supplies"
          >
            {"\u2695"}
          </button>
          <button
            className="icon-btn"
            onClick={() => setRecordOpen(true)}
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
        className={`agent-fab ${cosmetics.orbSkin ? `agent-fab--${cosmetics.orbSkin}` : ""}`}
        onClick={() => setChatOpen(true)}
        aria-label="Talk to your companion"
      >
        <FaceAvatar emotion={restingFace} crack={crack} />
      </button>

      <Toasts />
      <Celebrate />
      <BondMilestone />
      <FallenOverlay />
      <ChatPanel />
      <SettingsPanel />
      <ServiceRecord />
      <SuppliesPanel />
      <WardrobePanel />
      <MoodSheet />
      <AddEditSheet />
      <Welcome />
    </div>
  );
}
