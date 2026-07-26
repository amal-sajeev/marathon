/**
 * Strips AI writing tells out of Leela's prose before it is ever shown.
 *
 * The system prompt has forbidden em dashes since the day she was written and
 * the model still produces them, because a style rule competes with everything
 * else in the context and loses. Anything that can be fixed by rule is fixed
 * here instead, where it cannot be talked out of it. The prompt is left to
 * carry only the judgement calls that need a writer.
 *
 * Everything below is deliberately conservative: a transform that mangles a
 * sentence is worse than the tell it removed.
 */

/** A dash used as a clause separator: em, en, or the double-hyphen disguise. */
const CLAUSE_DASH = /\s*(?:\u2014|\u2013|--)\s*/;
const CLAUSE_DASH_G = new RegExp(CLAUSE_DASH.source, "g");

/** Sentence enders, kept so segments can be rejoined exactly as they were. */
const SENTENCE_SPLIT = /([.!?]+["')\]]*\s+)/;

/**
 * Words that mark the right-hand side of a dash as its own clause, which means
 * the dash can become a full stop. Contractions are listed separately because
 * the apostrophe survives tokenising.
 */
const FINITE_VERBS = new Set([
  "is", "are", "was", "were", "be", "been", "am", "has", "have", "had",
  "will", "would", "can", "could", "should", "shall", "may", "might", "must",
  "do", "does", "did", "isn't", "aren't", "wasn't", "weren't", "don't",
  "doesn't", "didn't", "won't", "can't", "couldn't", "shouldn't", "hasn't",
  "haven't", "hadn't",
]);

const CONTRACTED_VERB = /^(?:i|you|we|they|he|she|it|that|this|there|who|what|here)'(?:s|re|ve|ll|d|m)$/;

/** A dash followed by one of these is joining fragments, so a comma fits. */
const CONJUNCTIONS = /^(?:and|or|but|so|yet|nor|not|then|plus|though|although|because|which|while|unless|until)\b/i;

/** Whole sentences that add nothing and read as a support-line script. */
const FILLER_SENTENCES: RegExp[] = [
  /^no\s+judg[e]?ment[^.!?]*$/i,
  /^no\s+pressure[^.!?]*$/i,
  /^(?:just|simply)\s+checking\s+in[^.!?]*$/i,
  /^(?:i'?m\s+)?here\s+(?:for\s+you|if\s+you\s+need|to\s+help)[^.!?]*$/i,
  /^(?:let\s+me\s+know|feel\s+free)[^.!?]*$/i,
  /^i\s+hope\s+this\s+helps[^.!?]*$/i,
  /^take\s+(?:your|all\s+the)\s+time[^.!?]*$/i,
  /^in\s+(?:conclusion|summary)[^.!?]*$/i,
];

/** Openers that get sliced off the front of a message. */
const FILLER_OPENERS: RegExp[] = [
  /^(?:certainly|absolutely|sure\s+thing|sure|of\s+course|understood|got\s+it|great\s+question)[,!.]\s+/i,
  /^i'?d\s+be\s+happy\s+to\s+help[,.!]?\s*/i,
  /^here'?s\s+the\s+(?:thing|kicker|deal)[,.:]\s*/i,
  /^let'?s\s+(?:break\s+this\s+down|unpack\s+this|dive\s+in)[,.:]\s*/i,
  /^it'?s\s+worth\s+noting\s+that\s+/i,
  /^(?:importantly|notably|interestingly)[,]\s+/i,
];

function words(s: string): string[] {
  return s.toLowerCase().match(/[a-z']+/g) ?? [];
}

/** Does the text after a dash stand on its own as a sentence? */
function isIndependentClause(rhs: string): boolean {
  const head = words(rhs).slice(0, 6);
  return head.some((w) => FINITE_VERBS.has(w) || CONTRACTED_VERB.test(w));
}

/** Is the text after a dash a run-on list, where a colon reads best? */
function isList(rhs: string): boolean {
  return rhs.includes(",") && /\b(?:or|and)\b/.test(rhs);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Replace clause dashes inside a single sentence.
 *
 * A pair of them is always parenthetical, so both become commas. A lone one
 * depends on what follows: a conjunction or a bare list takes a comma or a
 * colon, and a clause that could stand alone gets a full stop, which is what
 * the dash was standing in for.
 */
function repairSentence(sentence: string): string {
  const hits = [...sentence.matchAll(CLAUSE_DASH_G)].filter((m) => {
    // Leave numeric ranges (a 3-5 minute job) alone.
    const before = sentence[m.index! - 1] ?? "";
    const after = sentence[m.index! + m[0].length] ?? "";
    return !(/\d/.test(before) && /\d/.test(after));
  });

  if (hits.length === 0) return sentence;
  if (hits.length > 1) return sentence.replace(CLAUSE_DASH_G, ", ");

  const hit = hits[0];
  const lhs = sentence.slice(0, hit.index).trimEnd();
  const rhs = sentence.slice(hit.index! + hit[0].length).trimStart();
  if (!lhs || !rhs) return sentence.replace(CLAUSE_DASH_G, " ");

  if (CONJUNCTIONS.test(rhs)) return `${lhs}, ${rhs}`;
  if (isList(rhs)) return `${lhs}: ${rhs}`;
  if (isIndependentClause(rhs)) return `${lhs}. ${capitalise(rhs)}`;
  return `${lhs}, ${rhs}`;
}

function repairDashes(text: string): string {
  return text
    .split(SENTENCE_SPLIT)
    .map((part) => (SENTENCE_SPLIT.test(part) ? part : repairSentence(part)))
    .join("");
}

/** Curly quotes, ellipses and arrows: characters no one types by hand. */
function normaliseGlyphs(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u2192/g, "->")
    .replace(/\u00A0/g, " ");
}

/**
 * Drop roleplay actions in single asterisks. Bold is protected first, since
 * she is allowed to bold the quests she sets up.
 */
function stripStageDirections(text: string): string {
  const BOLD = "\u0000BOLD\u0000";
  const protectedText = text.replace(/\*\*/g, BOLD);
  const cleaned = protectedText.replace(/\*([^*\n]{1,40})\*/g, (whole, inner: string) =>
    words(inner).length <= 4 && !/[.!?]/.test(inner) ? "" : whole,
  );
  return cleaned.replace(new RegExp(BOLD, "g"), "**");
}

function dropFillerSentences(text: string): string {
  const parts = text.split(SENTENCE_SPLIT);
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i];
    const ender = parts[i + 1] ?? "";
    // The last sentence keeps its full stop, since the split only fires on
    // punctuation that has whitespace after it.
    const bare = body.trim().replace(/[.!?]+$/, "");
    // Only ever a short closer. "No pressure" opens a throwaway line, but it
    // also opens "No pressure today, but the report is due Friday", and that
    // sentence is carrying information.
    const disposable = bare.length > 0 && words(bare).length <= 8;
    if (disposable && FILLER_SENTENCES.some((re) => re.test(bare))) continue;
    kept.push(body, ender);
  }
  return kept.join("");
}

function dropFillerOpeners(text: string): string {
  let out = text;
  for (const re of FILLER_OPENERS) {
    const next = out.replace(re, "");
    if (next !== out) out = capitalise(next.trimStart());
  }
  return out;
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Clean one piece of Leela's prose. Safe to run on anything she writes,
 * including diary pages and letters, and safe to run twice.
 */
export function deTrope(text: string): string {
  if (!text) return text;
  let out = normaliseGlyphs(text);
  out = stripStageDirections(out);
  out = repairDashes(out);
  out = dropFillerSentences(out);
  out = dropFillerOpeners(out);
  return tidy(out);
}

/**
 * Tells that need a rewrite rather than a substitution: reframes, rhetorical
 * questions, borrowed vocabulary. Reported rather than repaired, because
 * fixing them by rule means guessing at what she meant.
 */
/**
 * A bare noun phrase posed as a question and answered on the spot, as in
 * "The result? Gold." It has to open the sentence and carry no verb, or every
 * ordinary question that happens to contain "the" trips it.
 */
const RHETORICAL = /(?:^|[.!?]["')\]]*\s+)(the\s+(?:\w+\s+){0,2}\w+)\?\s+\S/i;

function isRhetorical(text: string): boolean {
  const match = text.match(RHETORICAL);
  if (!match) return false;
  return !words(match[1]).some((w) => FINITE_VERBS.has(w) || CONTRACTED_VERB.test(w));
}

const JUDGEMENT_CALLS: Array<[string, (text: string) => boolean]> = [
  ["negative parallelism", (t) => /\b(?:it'?s|that'?s|this is)\s+not\s+[^.!?]{2,60}[,.]\s*(?:it'?s|that'?s|they'?re)\b/i.test(t)],
  ["negative parallelism", (t) => /\bnot\s+because\s+[^.!?]{2,60},\s*but\s+because\b/i.test(t)],
  ["self-answered question", isRhetorical],
  ["false suspense", (t) => /\bhere'?s\s+(?:the\s+(?:thing|kicker|deal)|where\s+it\s+gets|what\s+most)/i.test(t)],
  ["pedagogical voice", (t) => /\blet'?s\s+(?:break\s+this\s+down|unpack|dive\s+in)\b/i.test(t)],
  ["filler transition", (t) => /\b(?:it'?s\s+worth\s+noting|it\s+bears\s+mentioning)\b/i.test(t)],
  ["borrowed vocabulary", (t) => /\b(?:delve|utilise|utilize|leverage|robust|streamline|harness|tapestry|paradigm|synergy)\b/i.test(t)],
  ["magic adverb", (t) => /\b(?:quietly|deeply|fundamentally|remarkably|arguably)\b/i.test(t)],
  ["the serves-as dodge", (t) => /\b(?:serves\s+as|stands\s+as)\b/i.test(t)],
  ["signposted conclusion", (t) => /\b(?:in\s+conclusion|to\s+sum\s+up|in\s+summary)\b/i.test(t)],
];

/** Names of the tells left in a piece of text, for logging and tests. */
export function judgementCalls(text: string): string[] {
  const found = new Set<string>();
  for (const [name, hit] of JUDGEMENT_CALLS) {
    if (hit(text)) found.add(name);
  }
  return [...found];
}
