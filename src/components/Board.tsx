import { useMemo, useState } from "react";
import { useStore, type Tab } from "../state/store";
import type { TaskType } from "../state/types";
import { TaskCard } from "./TaskCard";

const TAB_TO_TYPE: Record<Tab, TaskType> = {
  dailies: "daily",
  habits: "habit",
  todos: "todo",
  rewards: "reward",
};

const TITLES: Record<Tab, string> = {
  dailies: "Today's Dailies",
  habits: "Habits",
  todos: "To-Do Quests",
  rewards: "Reward Shelf",
};

const EMPTY: Record<Tab, { glyph: string; title: string; hint: string }> = {
  dailies: {
    glyph: "\u2600",
    title: "No dailies yet",
    hint: "Ask your companion for a routine, or add one yourself.",
  },
  habits: {
    glyph: "\u21BB",
    title: "No habits tracked",
    hint: "Habits are the little things you do (or avoid) all day.",
  },
  todos: {
    glyph: "\u2713",
    title: "Quest log is empty",
    hint: "One-off tasks live here. Add one and go conquer it.",
  },
  rewards: {
    glyph: "\u2666",
    title: "Nothing to spend gold on",
    hint: "Set a treat you can buy with the gold you earn.",
  },
};

export function Board() {
  const activeTab = useStore((s) => s.activeTab);
  const tasks = useStore((s) => s.state.tasks);
  const setAddOpen = useStore((s) => s.setAddOpen);

  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const type = TAB_TO_TYPE[activeTab];
  const typed = useMemo(() => tasks.filter((t) => t.type === type), [tasks, type]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    typed.forEach((t) => t.tags?.forEach((x) => set.add(x)));
    return [...set].sort();
  }, [typed]);

  const q = query.trim().toLowerCase();
  const filtered = typed.filter((t) => {
    if (tag && !(t.tags ?? []).includes(tag)) return false;
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      (t.notes ?? "").toLowerCase().includes(q) ||
      (t.tags ?? []).some((x) => x.toLowerCase().includes(q))
    );
  });

  const empty = EMPTY[activeTab];

  return (
    <div className="board">
      <div className="board__head">
        <div className="board__title">{TITLES[activeTab]}</div>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => setAddOpen(type)}
        >
          + Add
        </button>
      </div>

      {typed.length > 0 && (
        <div className="board__filter">
          <input
            className="input input--search"
            value={query}
            placeholder="Search..."
            onChange={(e) => setQuery(e.target.value)}
          />
          {allTags.length > 0 && (
            <div className="tag-chips">
              {allTags.map((x) => (
                <button
                  key={x}
                  className={`tag-chip ${tag === x ? "tag-chip--on" : ""}`}
                  onClick={() => setTag(tag === x ? null : x)}
                >
                  #{x}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty__glyph">{empty.glyph}</div>
          <div className="empty__title">
            {typed.length === 0 ? empty.title : "Nothing matches"}
          </div>
          <div className="empty__hint">
            {typed.length === 0 ? empty.hint : "Try a different search or tag."}
          </div>
        </div>
      ) : (
        filtered.map((t, i) => (
          <TaskCard
            key={t.id}
            task={t}
            first={i === 0}
            last={i === filtered.length - 1}
          />
        ))
      )}
    </div>
  );
}
