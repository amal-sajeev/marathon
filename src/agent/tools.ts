import { uid, useStore } from "../state/store";
import type { ChecklistItem, Daily, Difficulty, Habit, Task, Todo } from "../state/types";

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
      description:
        "Revise any field of an existing task by id. Use this freely when the user describes a change: rename, re-note, or re-difficulty anything; reschedule a daily (repeatDays) or a to-do (dueDate); reprice a reward (cost); flip a habit's good/bad sides (positive/negative); retag (tags); or set a reminder (remindAt). Only send the fields that change.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          notes: { type: "string" },
          difficulty: difficultyEnum,
          repeatDays: {
            type: "array",
            items: { type: "integer", minimum: 0, maximum: 6 },
            description: "For a daily: weekdays it is active, 0=Sunday..6=Saturday.",
          },
          dueDate: {
            type: "string",
            description: "For a to-do: due date as YYYY-MM-DD.",
          },
          cost: {
            type: "number",
            description: "For a reward: its gold cost.",
          },
          positive: {
            type: "boolean",
            description: "For a habit: enable the '+' (good) side.",
          },
          negative: {
            type: "boolean",
            description: "For a habit: enable the '-' (bad) side.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Replace the task's tags with this list.",
          },
          remindAt: {
            type: "string",
            description:
              "Set a reminder: a daily uses 'HH:MM'; a to-do uses an ISO datetime. Empty string clears it.",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "uncomplete_task",
      description:
        "Mark a daily or to-do as NOT done again (reverses a completion). Use when the user says they hadn't actually finished it or ticked it by mistake.",
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
      name: "set_reminder",
      description:
        "Set or clear a task's reminder. For a daily pass time as 'HH:MM'; for a to-do pass an ISO datetime. Omit time (or pass empty) to clear it.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          time: {
            type: "string",
            description: "'HH:MM' for a daily, ISO datetime for a to-do, empty to clear.",
          },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_checklist",
      description:
        "Add, remove, or rename a checklist sub-step on a daily or to-do. Use add with 'text'; remove or rename with 'itemId' (rename also needs 'text'). Use list_tasks/get details to find item ids if needed.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The task id." },
          op: { type: "string", enum: ["add", "remove", "rename"] },
          text: { type: "string", description: "New text for add/rename." },
          itemId: { type: "string", description: "Which checklist item, for remove/rename." },
        },
        required: ["id", "op"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_adventurer",
      description:
        "Change what the adventurer (the user's character) is called. Use when they tell you their name or ask to be called something.",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
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
      name: "claim_daily_gift",
      description:
        "Give the user their once-per-day gift (some gold or a consumable, scaled by their login streak). Call this when you offer them the day's gift; it grants it and tells you what it was. Returns already:true if they've had it today.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_followup",
      description:
        "Make a note to yourself to raise something later, so you can bring it up in a future check-in ('ask how the interview went'). Use when the user mentions something time-bound you'd naturally want to circle back on. Keep it short and specific.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "What to remember to bring up." },
          dueDate: {
            type: "string",
            description: "Optional YYYY-MM-DD when it becomes relevant. Omit for the next chat.",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_followups",
      description: "List the things you meant to follow up on, with ids.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_followup",
      description:
        "Mark a follow-up as handled once you've raised it and don't need to bring it up again.",
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
  const base: Record<string, unknown> = {
    id: t.id,
    type: t.type,
    title: t.title,
    difficulty: t.difficulty,
    tags: t.tags,
    remindAt: t.remindAt,
  };
  if (t.type === "daily") {
    const d = t as Daily;
    return {
      ...base,
      repeatDays: d.repeatDays,
      done: d.done,
      checklist: d.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
    };
  }
  if (t.type === "todo") {
    const td = t as Todo;
    return {
      ...base,
      dueDate: td.dueDate,
      done: td.done,
      checklist: td.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
    };
  }
  if (t.type === "habit") {
    const h = t as Habit;
    return { ...base, positive: h.positive, negative: h.negative };
  }
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
      if (Array.isArray(args.repeatDays)) patch.repeatDays = args.repeatDays;
      if (args.dueDate !== undefined) patch.dueDate = String(args.dueDate);
      if (typeof args.cost === "number") patch.cost = args.cost;
      if (typeof args.positive === "boolean") patch.positive = args.positive;
      if (typeof args.negative === "boolean") patch.negative = args.negative;
      if (Array.isArray(args.tags))
        patch.tags = (args.tags as unknown[]).map((t) => String(t)).filter(Boolean);
      if (args.remindAt !== undefined) {
        const r = String(args.remindAt).trim();
        patch.remindAt = r === "" ? undefined : r;
      }
      store.updateTask(id, patch as Partial<Task>);
      return { ok: true, updated: summarizeTask(store.state.tasks.find((t) => t.id === id)!) };
    }
    case "uncomplete_task": {
      const id = String(args.id ?? "");
      const task = store.state.tasks.find((t) => t.id === id);
      if (!task || (task.type !== "daily" && task.type !== "todo"))
        return { ok: false, error: "No daily or to-do with that id." };
      const done = (task as Daily | Todo).done;
      if (!done) return { ok: true, already: true };
      if (task.type === "daily") store.toggleDaily(id);
      else store.toggleTodo(id);
      return { ok: true, uncompleted: task.title };
    }
    case "set_reminder": {
      const id = String(args.id ?? "");
      const task = store.state.tasks.find((t) => t.id === id);
      if (!task) return { ok: false, error: "No task with that id." };
      const time = args.time === undefined ? "" : String(args.time).trim();
      store.updateTask(id, { remindAt: time === "" ? undefined : time } as Partial<Task>);
      return { ok: true, remindAt: time || null };
    }
    case "edit_checklist": {
      const id = String(args.id ?? "");
      const task = store.state.tasks.find((t) => t.id === id);
      if (!task || (task.type !== "daily" && task.type !== "todo"))
        return { ok: false, error: "Only dailies and to-dos have checklists." };
      const op = String(args.op ?? "");
      const list: ChecklistItem[] = [...((task as Daily | Todo).checklist ?? [])];
      if (op === "add") {
        const text = String(args.text ?? "").trim();
        if (!text) return { ok: false, error: "Need text to add." };
        list.push({ id: uid(), text, done: false });
      } else if (op === "remove") {
        const itemId = String(args.itemId ?? "");
        const idx = list.findIndex((c) => c.id === itemId);
        if (idx < 0) return { ok: false, error: "No checklist item with that id." };
        list.splice(idx, 1);
      } else if (op === "rename") {
        const itemId = String(args.itemId ?? "");
        const text = String(args.text ?? "").trim();
        const item = list.find((c) => c.id === itemId);
        if (!item) return { ok: false, error: "No checklist item with that id." };
        if (!text) return { ok: false, error: "Need new text to rename." };
        item.text = text;
      } else {
        return { ok: false, error: "op must be add, remove, or rename." };
      }
      store.updateTask(id, { checklist: list } as Partial<Task>);
      return { ok: true, checklist: list.map((c) => ({ id: c.id, text: c.text })) };
    }
    case "rename_adventurer": {
      const name = String(args.name ?? "").trim();
      if (!name) return { ok: false, error: "Need a name." };
      store.renameCharacter(name);
      return { ok: true, name };
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
    case "claim_daily_gift": {
      const gift = store.claimDailyGift();
      if (!gift) return { ok: true, already: true };
      return { ok: true, gift: gift.text };
    }
    case "schedule_followup": {
      const text = String(args.text ?? "").trim();
      if (!text) return { ok: false, error: "Nothing to follow up on." };
      const dueDate = args.dueDate ? String(args.dueDate) : undefined;
      const f = store.addFollowup(text, dueDate);
      if (!f) return { ok: false, error: "Could not save that." };
      return { ok: true, id: f.id, text: f.text, dueDate: f.dueDate ?? null };
    }
    case "list_followups": {
      const followups = store.state.followups
        .filter((f) => !f.done)
        .map((f) => ({ id: f.id, text: f.text, dueDate: f.dueDate }));
      return { ok: true, followups };
    }
    case "complete_followup": {
      const id = String(args.id ?? "");
      const exists = store.state.followups.some((f) => f.id === id);
      if (!exists) return { ok: false, error: "No follow-up with that id." };
      store.completeFollowup(id);
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
