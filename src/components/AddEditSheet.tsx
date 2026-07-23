import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import type {
  Daily,
  Difficulty,
  Reward,
  Task,
  TaskType,
  Todo,
} from "../state/types";

const DIFFS: Difficulty[] = ["trivial", "easy", "medium", "hard"];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const TYPE_TITLE: Record<TaskType, string> = {
  habit: "Habit",
  daily: "Daily",
  todo: "To-Do",
  reward: "Reward",
};

interface FormState {
  title: string;
  notes: string;
  difficulty: Difficulty;
  positive: boolean;
  negative: boolean;
  repeatDays: number[];
  dueDate: string;
  cost: number;
  checklistText: string;
}

function initForm(task: Task | null): FormState {
  return {
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    difficulty: task?.difficulty ?? "easy",
    positive: task?.type === "habit" ? task.positive : true,
    negative: task?.type === "habit" ? task.negative : true,
    repeatDays:
      task?.type === "daily" ? task.repeatDays : [0, 1, 2, 3, 4, 5, 6],
    dueDate: task?.type === "todo" ? (task as Todo).dueDate ?? "" : "",
    cost: task?.type === "reward" ? (task as Reward).cost : 15,
    checklistText:
      task && (task.type === "daily" || task.type === "todo")
        ? (task as Daily | Todo).checklist.map((c) => c.text).join("\n")
        : "",
  };
}

export function AddEditSheet() {
  const addOpen = useStore((s) => s.addOpen);
  const editing = useStore((s) => s.editing);
  const setAddOpen = useStore((s) => s.setAddOpen);
  const setEditing = useStore((s) => s.setEditing);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);

  const type: TaskType | null = editing ? editing.type : addOpen;
  const isEdit = !!editing;

  const [form, setForm] = useState<FormState>(() => initForm(editing));
  // re-seed form when target changes
  const seedKey = editing?.id ?? addOpen ?? "none";
  const seeded = useMemo(() => seedKey, [seedKey]);
  const [lastSeed, setLastSeed] = useState(seeded);
  if (seeded !== lastSeed) {
    setLastSeed(seeded);
    setForm(initForm(editing));
  }

  if (!type) return null;

  const close = () => {
    setAddOpen(null);
    setEditing(null);
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleDay = (d: number) =>
    setForm((f) => ({
      ...f,
      repeatDays: f.repeatDays.includes(d)
        ? f.repeatDays.filter((x) => x !== d)
        : [...f.repeatDays, d].sort(),
    }));

  const checklist = form.checklistText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const submit = () => {
    if (!form.title.trim()) return;
    if (isEdit && editing) {
      const patch: Partial<Task> = {
        title: form.title.trim(),
        notes: form.notes.trim() || undefined,
        difficulty: form.difficulty,
      };
      if (type === "habit") {
        Object.assign(patch, { positive: form.positive, negative: form.negative });
      } else if (type === "daily") {
        Object.assign(patch, {
          repeatDays: form.repeatDays,
          checklist: checklist.map((text, i) => ({
            id: `${editing.id}-c${i}`,
            text,
            done: false,
          })),
        });
      } else if (type === "todo") {
        Object.assign(patch, {
          dueDate: form.dueDate || undefined,
          checklist: checklist.map((text, i) => ({
            id: `${editing.id}-c${i}`,
            text,
            done: false,
          })),
        });
      } else if (type === "reward") {
        Object.assign(patch, { cost: Number(form.cost) || 0 });
      }
      updateTask(editing.id, patch);
    } else {
      addTask({
        type,
        title: form.title.trim(),
        notes: form.notes.trim() || undefined,
        difficulty: form.difficulty,
        positive: form.positive,
        negative: form.negative,
        repeatDays: form.repeatDays,
        dueDate: form.dueDate || undefined,
        cost: Number(form.cost) || 0,
        checklist,
      });
    }
    close();
  };

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="sheet">
        <div className="sheet__grip" />
        <div className="sheet__head">
          <span className="sheet__title">
            {isEdit ? "Edit" : "New"} {TYPE_TITLE[type]}
          </span>
          <button className="icon-btn" onClick={close} aria-label="Close">
            {"\u2715"}
          </button>
        </div>

        <div className="sheet__body">
          <div className="field">
            <label className="field__label">Title</label>
            <input
              className="input"
              value={form.title}
              autoFocus
              placeholder={
                type === "reward" ? "e.g. One guilt-free episode" : "e.g. Drink water"
              }
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label">Notes (optional)</label>
            <textarea
              className="textarea"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {type !== "reward" && (
            <div className="field">
              <label className="field__label">Difficulty</label>
              <div className="seg">
                {DIFFS.map((d) => (
                  <button
                    key={d}
                    className={`seg__opt ${form.difficulty === d ? "seg__opt--on" : ""}`}
                    onClick={() => set("difficulty", d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === "habit" && (
            <div className="field">
              <label className="field__label">Sides</label>
              <div className="seg">
                <button
                  className={`seg__opt ${form.positive ? "seg__opt--on" : ""}`}
                  onClick={() => set("positive", !form.positive)}
                >
                  + Good
                </button>
                <button
                  className={`seg__opt ${form.negative ? "seg__opt--on" : ""}`}
                  onClick={() => set("negative", !form.negative)}
                >
                  {"\u2212"} Bad
                </button>
              </div>
            </div>
          )}

          {type === "daily" && (
            <div className="field">
              <label className="field__label">Repeats on</label>
              <div className="days">
                {DAY_LABELS.map((lbl, i) => (
                  <button
                    key={i}
                    className={`day ${form.repeatDays.includes(i) ? "day--on" : ""}`}
                    onClick={() => toggleDay(i)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === "todo" && (
            <div className="field">
              <label className="field__label">Due date (optional)</label>
              <input
                className="input"
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </div>
          )}

          {(type === "daily" || type === "todo") && (
            <div className="field">
              <label className="field__label">Checklist (one per line)</label>
              <textarea
                className="textarea"
                value={form.checklistText}
                placeholder={"Step one\nStep two"}
                onChange={(e) => set("checklistText", e.target.value)}
              />
            </div>
          )}

          {type === "reward" && (
            <div className="field">
              <label className="field__label">Gold cost</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.cost}
                onChange={(e) => set("cost", Number(e.target.value))}
              />
            </div>
          )}

          <div className="form-actions">
            {isEdit && (
              <button
                className="btn btn--danger"
                onClick={() => {
                  deleteTask(editing!.id);
                  close();
                }}
              >
                Delete
              </button>
            )}
            <button className="btn btn--primary" onClick={submit} style={{ flex: 2 }}>
              {isEdit ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
