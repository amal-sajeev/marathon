import type { ReactNode } from "react";
import { useStore } from "../state/store";
import { nominalXp } from "../state/scoring";
import type { Daily, Habit, Reward, Task, Todo } from "../state/types";
import { DifficultyPips } from "./DifficultyPips";
import { Coin } from "./Gauges";
import { TaskHexIcon } from "./HexIcon";

function Checklist({ task }: { task: Daily | Todo }) {
  const toggle = useStore((s) => s.toggleChecklistItem);
  if (!task.checklist || task.checklist.length === 0) return null;
  return (
    <div className="checklist">
      {task.checklist.map((c) => (
        <div
          key={c.id}
          className="checklist__item"
          onClick={() => toggle(task.id, c.id)}
        >
          <span className={`checklist__box ${c.done ? "checklist__box--done" : ""}`}>
            {"\u2713"}
          </span>
          <span style={{ textDecoration: c.done ? "line-through" : "none" }}>
            {c.text}
          </span>
        </div>
      ))}
    </div>
  );
}

function XpBadge({ difficulty }: { difficulty: Task["difficulty"] }) {
  return <span className="xp-badge">{nominalXp(difficulty)} XP</span>;
}

function CardShell({
  task,
  control,
  done,
}: {
  task: Task;
  control: ReactNode;
  done?: boolean;
}) {
  const setEditing = useStore((s) => s.setEditing);
  return (
    <div className={`card card--${task.type} ${done ? "card--done" : ""}`}>
      <TaskHexIcon type={task.type} />
      <div className="card__body" onClick={() => setEditing(task)}>
        <div className={`card__title ${done ? "card__title--struck" : ""}`}>
          {task.title}
        </div>
        {task.notes && <div className="card__notes">{task.notes}</div>}
        <div className="card__meta">
          <DifficultyPips difficulty={task.difficulty} />
          {task.type === "daily" && (task as Daily).streak > 0 && (
            <span className="chip chip--streak">
              {"\u{1F525}"} {(task as Daily).streak}
            </span>
          )}
          {task.type === "todo" && (task as Todo).dueDate && (
            <span className="chip">due {(task as Todo).dueDate}</span>
          )}
          {task.type === "habit" && (
            <span className="chip">
              +{(task as Habit).countUp} / -{(task as Habit).countDown}
            </span>
          )}
        </div>
        {(task.type === "daily" || task.type === "todo") && (
          <Checklist task={task as Daily | Todo} />
        )}
      </div>
      <div className="card__side">
        {task.type !== "reward" && <XpBadge difficulty={task.difficulty} />}
        {control}
      </div>
    </div>
  );
}

export function TaskCard({ task }: { task: Task }) {
  const scoreHabit = useStore((s) => s.scoreHabit);
  const toggleDaily = useStore((s) => s.toggleDaily);
  const toggleTodo = useStore((s) => s.toggleTodo);
  const buyReward = useStore((s) => s.buyReward);
  const gold = useStore((s) => s.state.character.gold);

  if (task.type === "habit") {
    const h = task as Habit;
    return (
      <CardShell
        task={task}
        control={
          <div className="habit-controls">
            <button
              className={`orb orb--plus ${h.positive ? "" : "orb--off"}`}
              onClick={() => scoreHabit(h.id, "up")}
              aria-label="Good"
            >
              +
            </button>
            <button
              className={`orb orb--minus ${h.negative ? "" : "orb--off"}`}
              onClick={() => scoreHabit(h.id, "down")}
              aria-label="Bad"
            >
              {"\u2212"}
            </button>
          </div>
        }
      />
    );
  }

  if (task.type === "daily") {
    const d = task as Daily;
    return (
      <CardShell
        task={task}
        done={d.done}
        control={
          <button
            className={`check ${d.done ? "check--done" : ""}`}
            onClick={() => toggleDaily(d.id)}
            aria-label="Complete daily"
          >
            {"\u2713"}
          </button>
        }
      />
    );
  }

  if (task.type === "todo") {
    const t = task as Todo;
    return (
      <CardShell
        task={task}
        done={t.done}
        control={
          <button
            className={`check ${t.done ? "check--done" : ""}`}
            onClick={() => toggleTodo(t.id)}
            aria-label="Complete to-do"
          >
            {"\u2713"}
          </button>
        }
      />
    );
  }

  const r = task as Reward;
  return (
    <CardShell
      task={task}
      control={
        <button
          className="reward-cost"
          onClick={() => buyReward(r.id)}
          disabled={gold < r.cost}
          aria-label="Buy reward"
          style={{
            border: "none",
            background: "transparent",
            opacity: gold < r.cost ? 0.5 : 1,
          }}
        >
          <Coin amount={r.cost} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--neon-soft)" }}>
            buy
          </span>
        </button>
      }
    />
  );
}
