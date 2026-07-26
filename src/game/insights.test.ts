import { describe, expect, it } from "vitest";

import { computeInsights, insightBrief } from "./insights";
import { freshState } from "../state/store";
import { shiftDays } from "../state/cron";
import type { Daily, GameState, Habit, Keepsake } from "../state/types";

const NOW = new Date("2026-06-15T12:00:00");

/** A save with a given number of completions on each of the last N days. */
function withHistory(perDay: number[], now = NOW): GameState {
  const state = freshState("Test");
  state.bond.firstMet = new Date(
    now.getTime() - perDay.length * 86_400_000,
  ).toISOString();
  state.history = perDay.map((completed, i) => ({
    date: shiftDays(now, -(perDay.length - 1 - i)),
    completed,
    xp: completed * 10,
  }));
  return state;
}

function ids(state: GameState): string[] {
  return computeInsights(state, NOW).map((i) => i.id);
}

describe("thin data", () => {
  it("says nothing at all about an empty save", () => {
    expect(computeInsights(freshState("Test"), NOW)).toEqual([]);
  });

  it("produces no brief when there is nothing to say", () => {
    expect(insightBrief(freshState("Test"), NOW)).toBe("");
  });

  it("will not call a weekday strongest off four days", () => {
    const state = withHistory([3, 0, 5, 2]);
    expect(ids(state)).not.toContain("weekday");
  });

  it("will not judge consistency off a week", () => {
    const state = withHistory([1, 1, 1, 1, 1, 1, 1]);
    expect(ids(state)).not.toContain("consistency");
  });
});

describe("momentum", () => {
  it("sees a real jump", () => {
    const state = withHistory([1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4]);
    const found = computeInsights(state, NOW).find((i) => i.id === "momentum");
    expect(found?.tone).toBe("good");
    expect(found?.detail).toContain("28");
    expect(found?.detail).toContain("7");
  });

  it("sees a real drop", () => {
    const state = withHistory([4, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1]);
    expect(computeInsights(state, NOW).find((i) => i.id === "momentum")?.tone).toBe(
      "bad",
    );
  });

  it("calls a wobble steady rather than a trend", () => {
    const state = withHistory([2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 2]);
    expect(computeInsights(state, NOW).find((i) => i.id === "momentum")?.tone).toBe(
      "neutral",
    );
  });

  it("stays quiet when barely anything has happened", () => {
    expect(ids(withHistory([1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]))).not.toContain(
      "momentum",
    );
  });
});

describe("the board against reality", () => {
  it("flags a board bigger than the output", () => {
    const state = withHistory(new Array(20).fill(1));
    state.tasks = Array.from({ length: 6 }, (_, i) => daily(`Task ${i}`, 0));
    const found = computeInsights(state, NOW).find((i) => i.id === "overload");
    expect(found?.detail).toContain("6 dailies");
    expect(found?.tone).toBe("bad");
  });

  it("says nothing when the board is being cleared", () => {
    const state = withHistory(new Array(20).fill(5));
    state.tasks = Array.from({ length: 5 }, (_, i) => daily(`Task ${i}`, 0));
    expect(ids(state)).not.toContain("overload");
  });
});

describe("individual tasks", () => {
  it("names the longest-running daily as the anchor", () => {
    const state = withHistory(new Array(20).fill(2));
    state.tasks = [daily("Water", 3), daily("Walk", 22), daily("Read", 9)];
    const found = computeInsights(state, NOW).find((i) => i.id === "anchor");
    expect(found?.detail).toContain("Walk");
    expect(found?.detail).toContain("22 days");
  });

  it("weighs a daily she suggested above one they set themselves", () => {
    const mine = withHistory(new Array(20).fill(2));
    mine.tasks = [daily("Stretch", 0)];
    const hers = withHistory(new Array(20).fill(2));
    hers.tasks = [{ ...daily("Stretch", 0), suggestedByLeela: true }];

    const a = computeInsights(mine, NOW).find((i) => i.id === "weak-link")!;
    const b = computeInsights(hers, NOW).find((i) => i.id === "weak-link")!;
    expect(b.weight).toBeGreaterThan(a.weight);
  });

  it("flags a habit going the wrong way", () => {
    const state = withHistory(new Array(20).fill(2));
    state.tasks = [habit("Snacking", 1, 9)];
    expect(
      computeInsights(state, NOW).find((i) => i.id === "habit-drift")?.detail,
    ).toContain("Snacking");
  });

  it("leaves a habit that is winning alone", () => {
    const state = withHistory(new Array(20).fill(2));
    state.tasks = [habit("Water", 9, 1)];
    expect(ids(state)).not.toContain("habit-drift");
  });
});

describe("the brief handed to Leela", () => {
  it("frames the findings as something to have a view about", () => {
    const state = withHistory([1, 1, 1, 1, 1, 1, 1, 5, 5, 5, 5, 5, 5, 5]);
    const brief = insightBrief(state, NOW);
    expect(brief).toContain("WHAT THE RECORD ACTUALLY SHOWS");
    expect(brief).toContain("do not recite it");
  });

  it("stays short enough to leave room for the conversation", () => {
    const state = withHistory(new Array(90).fill(3));
    state.tasks = [daily("Walk", 30), daily("Stretch", 0), habit("Snacking", 1, 9)];
    expect(insightBrief(state, NOW).split("\n").length).toBeLessThanOrEqual(6);
  });
});

describe("her diary feeding back in", () => {
  it("notices when most recent pages share a mood", () => {
    const state = withHistory(new Array(20).fill(2));
    state.keepsakes = Array.from({ length: 8 }, (_, i) => page(i, "sad"));
    const found = computeInsights(state, NOW).find((i) => i.id === "mood-mirror");
    expect(found?.tone).toBe("bad");
  });

  it("stays quiet when her moods are mixed", () => {
    const state = withHistory(new Array(20).fill(2));
    state.keepsakes = ["sad", "happy", "neutral", "excited", "worried", "serious"].map(
      (e, i) => page(i, e),
    );
    expect(ids(state)).not.toContain("mood-mirror");
  });
});

/* helpers */

function daily(title: string, streak: number): Daily {
  return {
    id: title,
    type: "daily",
    title,
    difficulty: "easy",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    checklist: [],
    done: false,
    streak,
    repeatDays: [0, 1, 2, 3, 4, 5, 6],
  };
}

function habit(title: string, up: number, down: number): Habit {
  return {
    id: title,
    type: "habit",
    title,
    difficulty: "easy",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    value: 0,
    countUp: up,
    countDown: down,
    positive: true,
    negative: true,
  };
}

function page(daysAgo: number, emotion: string): Keepsake {
  return {
    id: `p${daysAgo}`,
    kind: "diary",
    title: "page",
    text: "...",
    createdAt: NOW.toISOString(),
    date: shiftDays(NOW, -daysAgo),
    emotion,
  };
}
