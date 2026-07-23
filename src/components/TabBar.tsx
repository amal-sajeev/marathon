import { useStore, type Tab } from "../state/store";

const TABS: { id: Tab; label: string; glyph: string; type: string }[] = [
  { id: "dailies", label: "Dailies", glyph: "\u2600", type: "daily" },
  { id: "habits", label: "Habits", glyph: "\u21BB", type: "habit" },
  { id: "todos", label: "To-Dos", glyph: "\u2713", type: "todo" },
  { id: "rewards", label: "Rewards", glyph: "\u2666", type: "reward" },
];

export function TabBar() {
  const activeTab = useStore((s) => s.activeTab);
  const setTab = useStore((s) => s.setTab);
  const tasks = useStore((s) => s.state.tasks);

  return (
    <div className="tabs" role="tablist">
      {TABS.map((t) => {
        const count = tasks.filter((x) => x.type === t.type).length;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`tab ${activeTab === t.id ? "tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab__glyph">{t.glyph}</span>
            <span>{t.label}</span>
            {count > 0 && <span className="tab__count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
