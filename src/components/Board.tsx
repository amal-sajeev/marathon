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

  const type = TAB_TO_TYPE[activeTab];
  const list = tasks.filter((t) => t.type === type);
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

      {list.length === 0 ? (
        <div className="empty">
          <div className="empty__glyph">{empty.glyph}</div>
          <div className="empty__title">{empty.title}</div>
          <div className="empty__hint">{empty.hint}</div>
        </div>
      ) : (
        list.map((t) => <TaskCard key={t.id} task={t} />)
      )}
    </div>
  );
}
