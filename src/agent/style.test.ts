import { describe, expect, it } from "vitest";

import { deTrope, judgementCalls } from "./style";

describe("dashes", () => {
  // Every one of these came off a real check-in, em dashes and all.
  it("splits two clauses into two sentences", () => {
    expect(
      deTrope(
        "Got a little something for you\u2014today's gift is ready when you are.",
      ),
    ).toBe("Got a little something for you. Today's gift is ready when you are.");
  });

  it("introduces a list with a colon", () => {
    expect(
      deTrope(
        "Anything new you'd like to add\u2014tasks, habits, or a reward to aim for?",
      ),
    ).toBe("Anything new you'd like to add: tasks, habits, or a reward to aim for?");
  });

  it("uses a comma before a conjunction", () => {
    expect(
      deTrope("And any other habits you've been keeping\u2014or slipping on?"),
    ).toBe("And any other habits you've been keeping, or slipping on?");
  });

  it("turns a parenthetical pair into commas", () => {
    expect(deTrope("The board \u2014 all four of them \u2014 is clear.")).toBe(
      "The board, all four of them, is clear.",
    );
  });

  it("catches the double-hyphen disguise", () => {
    expect(deTrope("You said you'd start Monday -- it's Thursday.")).toBe(
      "You said you'd start Monday. It's Thursday.",
    );
  });

  it("leaves numeric ranges alone", () => {
    expect(deTrope("Give it 3\u20135 minutes.")).toBe("Give it 3\u20135 minutes.");
  });

  it("leaves ordinary hyphens alone", () => {
    expect(deTrope("Your check-in is set.")).toBe("Your check-in is set.");
  });

  it("handles several sentences at once", () => {
    // "One down, two to go" is elliptical rather than two clauses, so the
    // comma is the right call and the second dash still becomes a full stop.
    expect(
      deTrope("One down\u2014two to go. Nice work\u2014that was the hard one."),
    ).toBe("One down, two to go. Nice work. That was the hard one.");
  });
});

describe("glyphs", () => {
  it("straightens quotes and ellipses", () => {
    expect(deTrope("\u201CWater\u201D is done, but the report\u2026 isn't.")).toBe(
      '"Water" is done, but the report... isn\'t.',
    );
  });

  it("straightens apostrophes", () => {
    expect(deTrope("That\u2019s three days running.")).toBe(
      "That's three days running.",
    );
  });
});

describe("roleplay and filler", () => {
  it("drops stage directions", () => {
    expect(deTrope("*smiles* Good. That's the report gone.")).toBe(
      "Good. That's the report gone.",
    );
  });

  it("keeps bold quest names", () => {
    expect(deTrope("**Write the report** is on the board.")).toBe(
      "**Write the report** is on the board.",
    );
  });

  it("keeps a long italic aside, which is not a stage direction", () => {
    expect(deTrope("You said *the whole thing was fine yesterday* though.")).toBe(
      "You said *the whole thing was fine yesterday* though.",
    );
  });

  it("cuts the support-line closer", () => {
    expect(
      deTrope("Which ones got away from you? No judgment, just checking in."),
    ).toBe("Which ones got away from you?");
  });

  it("cuts a canned opener and recapitalises", () => {
    expect(deTrope("Certainly! I've added that to the board.")).toBe(
      "I've added that to the board.",
    );
  });

  it("keeps a filler opener that is carrying information", () => {
    const real = "No pressure today, but the report is due Friday.";
    expect(deTrope(real)).toBe(real);
  });

  it("leaves clean prose untouched", () => {
    const clean = "Water's logged. That's four days running, which is your best yet.";
    expect(deTrope(clean)).toBe(clean);
  });

  it("is safe to run twice", () => {
    const once = deTrope("Got something for you\u2014today's gift is ready.");
    expect(deTrope(once)).toBe(once);
  });
});

describe("judgement calls", () => {
  it("spots the reframe", () => {
    expect(judgementCalls("It's not laziness, it's a bad schedule.")).toContain(
      "negative parallelism",
    );
  });

  it("spots borrowed vocabulary", () => {
    expect(judgementCalls("Let's delve into your board.")).toContain(
      "borrowed vocabulary",
    );
  });

  it("spots the rhetorical question", () => {
    expect(judgementCalls("The result? Gold, and a level.")).toContain(
      "self-answered question",
    );
  });

  it("stays quiet on ordinary writing", () => {
    expect(judgementCalls("Water's logged. Four days running.")).toEqual([]);
  });

  it("stays quiet on a real question that mentions the board", () => {
    expect(
      judgementCalls("How's the board looking? Anything you want to add?"),
    ).toEqual([]);
  });

  it("stays quiet on a question with a verb in it", () => {
    expect(judgementCalls("The report is done? Good.")).toEqual([]);
  });
});
