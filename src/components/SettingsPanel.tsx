import { useState } from "react";
import { useStore } from "../state/store";
import {
  createNewSaveFile,
  detachSaveFile,
  exportSaveDownload,
  importSaveUpload,
  loadSaveFile,
} from "../save/persistence";

const MODELS = [
  { id: "mistral-small-latest", label: "Mistral Small (fast, cheap)" },
  { id: "mistral-medium-latest", label: "Mistral Medium" },
  { id: "mistral-large-latest", label: "Mistral Large (smartest)" },
];

export function SettingsPanel() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const fileName = useStore((s) => s.fileName);
  const fileSupported = useStore((s) => s.fileSupported);
  const saveStatus = useStore((s) => s.saveStatus);
  const character = useStore((s) => s.state.character);
  const renameCharacter = useStore((s) => s.renameCharacter);
  const pushToast = useStore((s) => s.pushToast);

  const [showKey, setShowKey] = useState(false);

  if (!open) return null;

  const guard = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      pushToast("File action canceled or blocked", "info");
    }
  };

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="sheet">
        <div className="sheet__grip" />
        <div className="sheet__head">
          <span className="sheet__title">Settings</span>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
            {"\u2715"}
          </button>
        </div>

        <div className="sheet__body">
          <div className="field">
            <label className="field__label">Adventurer name</label>
            <input
              className="input"
              value={character.name}
              onChange={(e) => renameCharacter(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label">Mistral API key</label>
            <div className="row">
              <input
                className="input"
                type={showKey ? "text" : "password"}
                value={settings.apiKey}
                placeholder="paste your key"
                autoComplete="off"
                onChange={(e) => setSettings({ apiKey: e.target.value.trim() })}
                style={{ flex: 3 }}
              />
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <div className="hint">
              Stored only in this browser (localStorage), on this device. It is sent
              directly to Mistral when you chat with your companion.
            </div>
          </div>

          <div className="field">
            <label className="field__label">Model</label>
            <select
              className="select"
              value={settings.model}
              onChange={(e) => setSettings({ model: e.target.value })}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label">CORS proxy URL (optional)</label>
            <input
              className="input"
              value={settings.proxyUrl}
              placeholder="https://corsproxy.io/?url="
              autoComplete="off"
              onChange={(e) => setSettings({ proxyUrl: e.target.value.trim() })}
            />
            <div className="hint">
              Only needed if direct calls to Mistral are blocked by the browser
              (CORS). A prefix ending in "=" gets the request URL appended; you can
              also use a {"{url}"} placeholder.
            </div>
          </div>

          <div className="field">
            <label className="field__label">Save file</label>
            <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
              {fileName
                ? `Linked to: ${fileName} - ${
                    saveStatus === "saving"
                      ? "saving..."
                      : saveStatus === "error"
                        ? "last save failed (permission?)"
                        : "auto-saving"
                  }`
                : "No save file linked. Progress is kept in this browser. Link a file to sync it across devices via your own cloud folder."}
            </div>

            {fileSupported ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="row">
                  <button className="btn" onClick={guard(createNewSaveFile)}>
                    New save file
                  </button>
                  <button className="btn" onClick={guard(loadSaveFile)}>
                    Load save file
                  </button>
                </div>
                {fileName && (
                  <button className="btn btn--ghost btn--sm" onClick={guard(detachSaveFile)}>
                    Detach file
                  </button>
                )}
              </div>
            ) : (
              <div className="row">
                <button className="btn" onClick={() => exportSaveDownload()}>
                  Export .rpgsave
                </button>
                <button className="btn" onClick={guard(importSaveUpload)}>
                  Import .rpgsave
                </button>
              </div>
            )}

            {fileSupported && (
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn--ghost btn--sm" onClick={() => exportSaveDownload()}>
                  Export copy
                </button>
                <button className="btn btn--ghost btn--sm" onClick={guard(importSaveUpload)}>
                  Import copy
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
