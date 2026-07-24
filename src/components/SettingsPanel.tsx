import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import {
  createNewSaveFile,
  detachSaveFile,
  exportSaveDownload,
  importSaveUpload,
  listBackups,
  loadSaveFile,
  reconnectSaveFile,
  restoreBackup,
  type BackupEntry,
} from "../save/persistence";
import {
  getPushStatus,
  permissionStatus,
  requestPermission,
  resyncPush,
  sendTestPush,
  supportsNotifications,
  type PushStatus,
} from "../notify/notifications";
import { runCheckIn } from "../agent/checkin";

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
  const memories = useStore((s) => s.state.memories);
  const addMemory = useStore((s) => s.addMemory);
  const deleteMemory = useStore((s) => s.deleteMemory);

  const [showKey, setShowKey] = useState(false);
  const [newMemory, setNewMemory] = useState("");
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);

  const refreshPushStatus = () => {
    void getPushStatus().then(setPushStatus);
  };

  useEffect(() => {
    if (open) {
      void listBackups().then((b) => setBackups([...b].reverse()));
      refreshPushStatus();
    }
  }, [open]);

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
            <label className="field__label">Check-ins</label>
            <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
              Leela pings you at the times below and runs a quick check-in:
              what to add, what you finished, how habits went, which to-dos you
              did or missed. Works best as an installed app on Android; if a
              notification is missed, the check-in runs next time you open the app.
            </div>

            {!supportsNotifications() && (
              <div className="hint" style={{ color: "var(--danger)" }}>
                This browser can't show notifications. Check-ins will still run
                when you open the app around a set time.
              </div>
            )}

            <label
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <input
                type="checkbox"
                style={{ flex: "0 0 auto", width: 18, height: 18 }}
                checked={settings.checkInsEnabled}
                onChange={async (e) => {
                  const on = e.target.checked;
                  if (on && supportsNotifications()) {
                    const granted = await requestPermission();
                    if (!granted) {
                      pushToast("Notifications were not allowed", "info");
                    }
                  }
                  setSettings({ checkInsEnabled: on });
                }}
              />
              <span>Enable proactive check-ins</span>
            </label>

            {permissionStatus() === "denied" && settings.checkInsEnabled && (
              <div className="hint" style={{ color: "var(--danger)" }}>
                Notifications are blocked in your browser settings. In-app
                check-ins still work when the app is open.
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 10,
              }}
            >
              {settings.checkInTimes.map((time, i) => (
                <div className="row" key={i} style={{ alignItems: "center" }}>
                  <input
                    className="input"
                    type="time"
                    value={time}
                    onChange={(e) => {
                      const next = [...settings.checkInTimes];
                      next[i] = e.target.value;
                      setSettings({ checkInTimes: next });
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ flex: "0 0 auto" }}
                    onClick={() =>
                      setSettings({
                        checkInTimes: settings.checkInTimes.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                    aria-label="Remove time"
                  >
                    {"\u2715"}
                  </button>
                </div>
              ))}
              <div className="row">
                <button
                  className="btn btn--sm"
                  onClick={() =>
                    setSettings({
                      checkInTimes: [...settings.checkInTimes, "18:00"],
                    })
                  }
                >
                  + Add time
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setOpen(false);
                    void runCheckIn();
                  }}
                >
                  Check in now
                </button>
              </div>
            </div>

            <label
              style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}
            >
              <input
                type="checkbox"
                style={{ flex: "0 0 auto", width: 18, height: 18 }}
                checked={settings.weeklyReview}
                onChange={(e) => setSettings({ weeklyReview: e.target.checked })}
              />
              <span>Weekly review with Leela (Sundays)</span>
            </label>

            <label
              className="field__label"
              style={{ marginTop: 12, display: "block" }}
            >
              Push server URL (optional)
            </label>
            <input
              className="input"
              value={settings.pushUrl}
              placeholder="https://rpgtask-push.you.workers.dev"
              autoComplete="off"
              onChange={(e) => setSettings({ pushUrl: e.target.value.trim() })}
            />
            <div className="hint">
              For notifications that arrive even when the app is fully closed,
              deploy the Cloudflare Worker in the <code>worker/</code> folder and
              paste its URL here. Leave blank to use best-effort local reminders
              only.
            </div>

            {settings.pushUrl.trim() !== "" && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                  <div>
                    Permission:{" "}
                    <strong>
                      {pushStatus ? pushStatus.permission : "checking..."}
                    </strong>
                  </div>
                  <div>
                    Subscription:{" "}
                    <strong style={{ color: pushStatus?.subscribed ? "var(--neon-soft)" : "var(--danger)" }}>
                      {pushStatus
                        ? pushStatus.subscribed
                          ? "active"
                          : "not subscribed"
                        : "checking..."}
                    </strong>
                  </div>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="btn btn--sm"
                    onClick={async () => {
                      await resyncPush();
                      refreshPushStatus();
                    }}
                  >
                    Reconnect push
                  </button>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={async () => {
                      await sendTestPush();
                      refreshPushStatus();
                    }}
                  >
                    Send test notification
                  </button>
                </div>
                <div className="hint" style={{ marginTop: 6 }}>
                  Tap "Send test notification", then lock or close the app; it
                  should still arrive. If it doesn't, tap "Reconnect push".
                </div>
              </div>
            )}

            <label
              style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}
            >
              <input
                type="checkbox"
                style={{ flex: "0 0 auto", width: 18, height: 18 }}
                checked={!!settings.spontaneousEnabled}
                onChange={(e) => setSettings({ spontaneousEnabled: e.target.checked })}
              />
              <span>Spontaneous check-ins (Leela pings at random times)</span>
            </label>
            {settings.spontaneousEnabled && (
              <div style={{ marginTop: 8 }}>
                <div className="row" style={{ alignItems: "center" }}>
                  <label className="field__label" style={{ flex: 1, margin: 0 }}>
                    Times per day
                  </label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={6}
                    value={settings.spontaneousCount ?? 2}
                    style={{ flex: "0 0 84px" }}
                    onChange={(e) =>
                      setSettings({
                        spontaneousCount: Math.max(1, Math.min(6, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </div>
                <div className="row" style={{ marginTop: 8, alignItems: "center" }}>
                  <input
                    className="input"
                    type="time"
                    value={settings.spontaneousStart ?? "10:00"}
                    onChange={(e) => setSettings({ spontaneousStart: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ flex: "0 0 auto", opacity: 0.7 }}>to</span>
                  <input
                    className="input"
                    type="time"
                    value={settings.spontaneousEnd ?? "21:00"}
                    onChange={(e) => setSettings({ spontaneousEnd: e.target.value })}
                    style={{ flex: 1 }}
                  />
                </div>
                <div className="hint" style={{ marginTop: 6 }}>
                  Needs the push server above. She'll surprise you within this
                  window - never more than you set.
                </div>
              </div>
            )}
          </div>

          <div className="field">
            <label className="field__label">What Leela remembers</label>
            <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
              Lasting details Leela keeps about you so she can be personal. She
              adds these as she learns them; you can add your own or remove any.
              They live in your save file.
            </div>

            {memories.length === 0 ? (
              <div className="hint" style={{ opacity: 0.8 }}>
                Nothing yet. As you talk with Leela, the things that matter will
                collect here.
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                {memories.map((m) => (
                  <div
                    className="row"
                    key={m.id}
                    style={{ alignItems: "flex-start", gap: 8 }}
                  >
                    <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
                      {m.text}
                      {m.category ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            color: "var(--text-faint)",
                          }}
                        >
                          {m.category}
                        </span>
                      ) : null}
                    </span>
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ flex: "0 0 auto" }}
                      onClick={() => deleteMemory(m.id)}
                      aria-label="Forget this"
                    >
                      {"\u2716"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
              <input
                className="input"
                value={newMemory}
                placeholder="Add something for Leela to remember"
                style={{ flex: 1 }}
                onChange={(e) => setNewMemory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newMemory.trim()) {
                    addMemory(newMemory, "other");
                    setNewMemory("");
                  }
                }}
              />
              <button
                className="btn btn--sm"
                style={{ flex: "0 0 auto" }}
                disabled={!newMemory.trim()}
                onClick={() => {
                  if (!newMemory.trim()) return;
                  addMemory(newMemory, "other");
                  setNewMemory("");
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field__label">Save file</label>
            <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
              {fileName
                ? `Linked to: ${fileName} - ${
                    saveStatus === "saving"
                      ? "saving..."
                      : saveStatus === "needs-permission"
                        ? "needs reconnect (tap below)"
                        : saveStatus === "error"
                          ? "last save failed (permission?)"
                          : "auto-saving"
                  }`
                : "No save file linked. Progress is kept in this browser. Link a file to sync it across devices via your own cloud folder."}
            </div>

            {fileName && saveStatus === "needs-permission" && (
              <div
                className="hint"
                style={{ marginTop: 0, marginBottom: 8, color: "var(--neon-soft)" }}
              >
                Tap Reconnect once to grant access. If this app is installed to
                your home screen, Android remembers it and won't ask again.
                Progress is safe in this browser meanwhile.
              </div>
            )}

            {fileSupported ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {fileName && saveStatus === "needs-permission" && (
                  <button
                    className="btn btn--primary"
                    onClick={guard(reconnectSaveFile)}
                  >
                    Reconnect save file
                  </button>
                )}
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

          <div className="field">
            <label className="field__label">Local backups</label>
            <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
              Automatic snapshots kept in this browser. If something goes wrong,
              restore a recent one.
            </div>
            {backups.length === 0 ? (
              <div className="hint" style={{ opacity: 0.8 }}>
                No backups yet. They start collecting as you play.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {backups.map((b) => (
                  <div className="row" key={b.savedAt} style={{ alignItems: "center" }}>
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {new Date(b.savedAt).toLocaleString()}
                    </span>
                    <button
                      className="btn btn--ghost btn--sm"
                      style={{ flex: "0 0 auto" }}
                      onClick={() => {
                        void restoreBackup(b.savedAt);
                        setOpen(false);
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
