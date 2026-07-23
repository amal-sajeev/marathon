import { useStore } from "../state/store";
import type { Daily, Difficulty, Task, Todo } from "../state/types";

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const difficultyEnum = {
  type: "string",
  enum: ["trivial", "easy", "medium", "hard"],
  description: "How demanding the task is; drives XP, gold and damage.",
};

export const TOOL_SPECS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "add_habit",
      description:
        "Create a habit: a repeatable behavior scored any number of times a day. Good habits reward XP/gold, bad ones cost HP. Set positive/negative to reflect that.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          notes: { type: "string" },
          difficulty: difficultyEnum,
          positive: {
            type: "boolean",
            description: "Whether the '+' (good) side is enabled.",
          },
          negative: {
            type: "boolean",
            description: "Whether the '-' (bad) side is enabled.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_daily",
      description:
        "Create a daily: something to do on a recurring schedule. Missing it on an active day costs HP.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          notes: { type: "string" },
          difficulty: difficultyEnum,
          repeatDays: {
            type: "array",
            items: { type: "integer", minimum: 0, maximum: 6 },
            description:
              "Weekdays it is active, 0=Sunday..6=Saturday. Omit for every day.",
          },
          checklist: {
            type: "array",
            items: { type: "string" },
            description: "Optional sub-steps.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_todo",
      description: "Create a one-off to-do, optionally with a due date and sub-steps.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          notes: { type: "string" },
          difficulty: difficultyEnum,
          dueDate: {
            type: "string",
            description: "Optional due date as YYYY-MM-DD.",
          },
          checklist: { type: "array", items: { type: "string" } },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_reward",
      description:
        "Create a custom reward the user can buy with gold they have earned.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          notes: { type: "string" },
          cost: { type: "number", description: "Gold cost. Default around 10-30." },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description:
        "List existing tasks, optionally filtered by type, so you avoid duplicates and can reference them.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["habit", "daily", "todo", "reward"],
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_character",
      description:
        "Get the adventurer's current level, HP, XP and gold so you can react to their state.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update fields of an existing task by id (title, notes, difficulty).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          notes: { type: "string" },
          difficulty: difficultyEnum,
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Delete a task by id.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
];

function summarizeTask(t: Task): Record<string, unknown> {
  const base = {
    id: t.id,
    type: t.type,
    title: t.title,
    difficulty: t.difficulty,
  };
  if (t.type === "daily")
    return { ...base, repeatDays: (t as Daily).repeatDays, done: (t as Daily).done };
  if (t.type === "todo")
    return { ...base, dueDate: (t as Todo).dueDate, done: (t as Todo).done };
  if (t.type === "reward") return { ...base, cost: (t as { cost: number }).cost };
  return base;
}

/** Execute a tool call against the store; returns a JSON-serializable result. */
export function runTool(
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const store = useStore.getState();

  switch (name) {
    case "add_habit": {
      const task = store.addTask({
        type: "habit",
        title: String(args.title ?? ""),
        notes: args.notes ? String(args.notes) : undefined,
        difficulty: (args.difficulty as Difficulty) ?? "easy",
        positive: args.positive as boolean | undefined,
        negative: args.negative as boolean | undefined,
      });
      return { ok: true, created: summarizeTask(task) };
    }
    case "add_daily": {
      const task = store.addTask({
        type: "daily",
        title: String(args.title ?? ""),
        notes: args.notes ? String(args.notes) : undefined,
        difficulty: (args.difficulty as Difficulty) ?? "easy",
        repeatDays: args.repeatDays as number[] | undefined,
        checklist: args.checklist as string[] | undefined,
      });
      return { ok: true, created: summarizeTask(task) };
    }
    case "add_todo": {
      const task = store.addTask({
        type: "todo",
        title: String(args.title ?? ""),
        notes: args.notes ? String(args.notes) : undefined,
        difficulty: (args.difficulty as Difficulty) ?? "easy",
        dueDate: args.dueDate ? String(args.dueDate) : undefined,
        checklist: args.checklist as string[] | undefined,
      });
      return { ok: true, created: summarizeTask(task) };
    }
    case "add_reward": {
      const task = store.addTask({
        type: "reward",
        title: String(args.title ?? ""),
        notes: args.notes ? String(args.notes) : undefined,
        cost: typeof args.cost === "number" ? (args.cost as number) : 15,
      });
      return { ok: true, created: summarizeTask(task) };
    }
    case "list_tasks": {
      const type = args.type as Task["type"] | undefined;
      const tasks = store.state.tasks
        .filter((t) => (type ? t.type === type : true))
        .map(summarizeTask);
      return { ok: true, tasks };
    }
    case "get_character": {
      const c = store.state.character;
      return {
        ok: true,
        character: {
          name: c.name,
          level: c.level,
          hp: Math.round(c.hp),
          maxHp: c.maxHp,
          xp: Math.round(c.xp),
          gold: Math.round(c.gold),
        },
      };
    }
    case "update_task": {
      const id = String(args.id ?? "");
      const exists = store.state.tasks.some((t) => t.id === id);
      if (!exists) return { ok: false, error: "No task with that id." };
      const patch: Record<string, unknown> = {};
      if (args.title !== undefined) patch.title = String(args.title);
      if (args.notes !== undefined) patch.notes = String(args.notes);
      if (args.difficulty !== undefined) patch.difficulty = args.difficulty;
      store.updateTask(id, patch as Partial<Task>);
      return { ok: true };
    }
    case "delete_task": {
      const id = String(args.id ?? "");
      const exists = store.state.tasks.some((t) => t.id === id);
      if (!exists) return { ok: false, error: "No task with that id." };
      store.deleteTask(id);
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown tool ${name}` };
  }
}
