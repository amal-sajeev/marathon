/**
 * The check-in that prompted all of this, verbatim, run through the parser the
 * way a real reply arrives. Regression cover for the whole path rather than
 * the transform alone.
 */
import { describe, expect, it } from "vitest";

import { extractEmotion } from "./emotions";
import { judgementCalls } from "./style";

const CHECKIN = [
  "[[happy]] Evening, Amal. Got a little something for you\u2014today's gift is ready when you are.",
  "[[neutral]] How's the board looking? Anything new you'd like to add\u2014tasks, habits, or a reward to aim for?",
  "[[thinking]] Let's see what you've knocked out since we last spoke. What's crossed the finish line?",
  "[[neutral]] How's the water habit holding up? And any other habits you've been keeping\u2014or slipping on?",
  "[[focused]] For today's dailies and open to-dos: which ones did you actually tackle, and which ones got away from you? No judgment, just checking in.",
];

describe("the check-in that started this", () => {
  const cleaned = CHECKIN.map((m) => extractEmotion(m).text);

  it("keeps the emotion tags working", () => {
    expect(CHECKIN.map((m) => extractEmotion(m).emotion)).toEqual([
      "happy",
      "neutral",
      "thinking",
      "neutral",
      "focused",
    ]);
  });

  it("leaves no em dash anywhere", () => {
    for (const line of cleaned) expect(line).not.toMatch(/[\u2014\u2013]|--/);
  });

  it("leaves no curly punctuation anywhere", () => {
    for (const line of cleaned) {
      expect(line).not.toMatch(/[\u2018\u2019\u201C\u201D\u2026]/);
    }
  });

  it("reads correctly line by line", () => {
    expect(cleaned).toEqual([
      "Evening, Amal. Got a little something for you. Today's gift is ready when you are.",
      "How's the board looking? Anything new you'd like to add: tasks, habits, or a reward to aim for?",
      "Let's see what you've knocked out since we last spoke. What's crossed the finish line?",
      "How's the water habit holding up? And any other habits you've been keeping, or slipping on?",
      "For today's dailies and open to-dos: which ones did you actually tackle, and which ones got away from you?",
    ]);
  });

  it("flags nothing left for a rewrite", () => {
    for (const line of cleaned) expect(judgementCalls(line)).toEqual([]);
  });
});
