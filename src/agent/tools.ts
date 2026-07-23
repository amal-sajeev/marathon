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
  {
    type: "function",
    function: {
      name: "complete_daily",
      description:
        "Mark a daily as done for today (grants XP/gold, extends its streak). Use when the user says they did it.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_todo",
      description:
        "Mark a to-do as done (grants XP/gold). Use when the user says they finished it.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "score_habit",
      description:
        "Record a habit occurrence: 'up' for the good side (rewards), 'down' for the bad side (costs HP). Use when the user reports doing or slipping on a habit.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          direction: { type: "string", enum: ["up", "down"] },
        },
        required: ["id", "direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description:
        "Save a lasting, meaningful detail about the person so you can be warm and specific in future conversations: their name, people they love, what they care about, long-term goals, what weighs on them, sensitivities, wins worth recalling. Phrase it as a short third-person note ('Their dog Rex is getting old'). Do NOT store trivia, one-off task status, or anything they'd want kept private unless they clearly want you to hold it. Check that it isn't already known first.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The detail, as a short note." },
          category: {
            type: "string",
            enum: ["person", "preference", "goal", "wellbeing", "milestone", "other"],
          },
          importance: {
            type: "integer",
            minimum: 1,
            maximum: 3,
            description: "1 = minor, 3 = central to who they are.",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_memory",
      description:
        "Revise a memory you already hold (e.g. a goal changed, a detail was wrong). Use list_memories first to get its id.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          category: {
            type: "string",
            enum: ["person", "preference", "goal", "wellbeing", "milestone", "other"],
          },
          importance: { type: "integer", minimum: 1, maximum: 3 },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forget_memory",
      description:
        "Let go of a memory by id when it's no longer true or the person asks you to forget it.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_memories",
      description:
        "List everything you currently remember about the person, with ids, so you can reference or revise it.",
      parameters: { type: "object", properties: {} },
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
    case "complete_daily": {
      const id = String(args.id ?? "");
      const task = store.state.tasks.find((t) => t.id === id);
      if (!task || task.type !== "daily")
        return { ok: false, error: "No daily with that id." };
      if ((task as Daily).done) return { ok: true, already: true };
      store.toggleDaily(id);
      return { ok: true, completed: task.title };
    }
    case "complete_todo": {
      const id = String(args.id ?? "");
      const task = store.state.tasks.find((t) => t.id === id);
      if (!task || task.type !== "todo")
        return { ok: false, error: "No to-do with that id." };
      if ((task as Todo).done) return { ok: true, already: true };
      store.toggleTodo(id);
      return { ok: true, completed: task.title };
    }
    case "score_habit": {
      const id = String(args.id ?? "");
      const dir = args.direction === "down" ? "down" : "up";
      const task = store.state.tasks.find((t) => t.id === id);
      if (!task || task.type !== "habit")
        return { ok: false, error: "No habit with that id." };
      store.scoreHabit(id, dir);
      return { ok: true, scored: task.title, direction: dir };
    }
    case "remember": {
      const text = String(args.text ?? "").trim();
      if (!text) return { ok: false, error: "Nothing to remember." };
      const category = args.category ? String(args.category) : undefined;
      const importance =
        typeof args.importance === "number" ? (args.importance as number) : undefined;
      const memory = store.addMemory(text, category, importance);
      if (!memory) return { ok: false, error: "Could not save that." };
      return { ok: true, id: memory.id, remembered: memory.text };
    }
    case "update_memory": {
      const id = String(args.id ?? "");
      const exists = store.state.memories.some((m) => m.id === id);
      if (!exists) return { ok: false, error: "No memory with that id." };
      const patch: Record<string, unknown> = {};
      if (args.text !== undefined) patch.text = String(args.text);
      if (args.category !== undefined) patch.category = String(args.category);
      if (args.importance !== undefined) patch.importance = args.importance;
      store.updateMemory(id, patch);
      return { ok: true };
    }
    case "forget_memory": {
      const id = String(args.id ?? "");
      const exists = store.state.memories.some((m) => m.id === id);
      if (!exists) return { ok: false, error: "No memory with that id." };
      store.deleteMemory(id);
      return { ok: true };
    }
    case "list_memories": {
      const memories = store.state.memories.map((m) => ({
        id: m.id,
        text: m.text,
        category: m.category,
        importance: m.importance,
      }));
      return { ok: true, memories };
    }
    default:
      return { ok: false, error: `Unknown tool ${name}` };
  }
}
