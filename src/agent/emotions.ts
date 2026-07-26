import { deTrope } from "./style";

/**
 * Leela's emotional range. Each reply is tagged with one of these (see
 * systemPrompt), which drives her face icon and the chat background art.
 */
export const EMOTIONS = [
  "neutral",
  "happy",
  "excited",
  "thinking",
  "surprised",
  "sad",
  "focused",
  "determined",
  "worried",
  "shocked",
  "laughing",
  "serious",
  "angry",
  "shy",
  "confident",
] as const;

export type Emotion = (typeof EMOTIONS)[number];

export function isEmotion(x: string): x is Emotion {
  return (EMOTIONS as readonly string[]).includes(x);
}

const TAG_RE = /^\s*\[\[\s*([a-zA-Z]+)\s*\]\]\s*/;
const CHIPS_RE = /\[\[\s*chips:\s*([^\]]+)\]\]/i;

/**
 * Pull a leading `[[emotion]]` tag and an optional `[[chips: a | b | c]]` tag
 * off a message. Returns the resolved emotion (falling back to "neutral"), any
 * suggested quick replies, and the message text with both tags removed.
 *
 * Every message she sends passes through here, chat and check-ins alike, so
 * this is also where her prose gets its style pass.
 */
export function extractEmotion(content: string): {
  emotion: Emotion;
  text: string;
  chips?: string[];
} {
  let text = content;

  // Suggested quick replies, from anywhere in the message.
  let chips: string[] | undefined;
  const chipMatch = text.match(CHIPS_RE);
  if (chipMatch) {
    chips = chipMatch[1]
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 4);
    text = text.replace(CHIPS_RE, "").trim();
    if (chips.length === 0) chips = undefined;
  }

  const match = text.match(TAG_RE);
  if (!match) return { emotion: "neutral", text: deTrope(text), chips };
  const key = match[1].toLowerCase();
  const emotion = isEmotion(key) ? key : "neutral";
  return { emotion, text: deTrope(text.slice(match[0].length)), chips };
}

const base = import.meta.env.BASE_URL;
const facePath = (name: string) => `${base}assets/faces/${name}`;

/** Leela's constant identity face (orb + intro). Reuses the neutral art. */
export const ICON_SRC = facePath("neutral-1.webp");
/** Guaranteed-present background used as the universal fallback. */
export const NEUTRAL_SRC = facePath("neutral-1.webp");

/** How many variants exist per emotion; default 1. Bump when you add more. */
const VARIANT_COUNTS: Partial<Record<Emotion, number>> = {
  neutral: 2,
  happy: 1,
  excited: 2,
  thinking: 3,
  surprised: 3,
  sad: 2,
  focused: 1,
  determined: 1,
  worried: 1,
  shocked: 1,
  laughing: 1,
  serious: 1,
  angry: 1,
  shy: 1,
  confident: 1,
};

// Sources that 404'd once are remembered so we stop retrying them.
const failed = new Set<string>();

export function markFaceFailed(src: string): void {
  failed.add(src);
}

function variantStem(emotion: Emotion): string {
  const count = VARIANT_COUNTS[emotion] ?? 1;
  const n = count > 1 ? 1 + Math.floor(Math.random() * count) : 1;
  return `${emotion}-${n}`;
}

/**
 * Ordered image sources to try for an emotion: WebP first (what the app ships),
 * then PNG (so a freshly dropped .png works without conversion), and finally the
 * neutral art so the background is never blank. Known-bad sources are skipped.
 */
export function faceCandidates(emotion: Emotion): string[] {
  const stem = variantStem(emotion);
  const list = [
    facePath(`${stem}.webp`),
    facePath(`${stem}.png`),
    NEUTRAL_SRC,
    facePath("neutral-1.png"),
  ];
  const usable = list.filter((s) => !failed.has(s));
  return usable.length > 0 ? [...new Set(usable)] : [NEUTRAL_SRC];
}

/**
 * Sources for her fixed identity face. Unlike faceCandidates this skips the
 * random variant pick, so a surface pinned to it always shows neutral-1 instead
 * of flipping between the two neutral images on every mount.
 */
export function identityCandidates(): string[] {
  const list = [ICON_SRC, facePath("neutral-1.png")];
  const usable = list.filter((s) => !failed.has(s));
  return usable.length > 0 ? [...new Set(usable)] : [ICON_SRC];
}
