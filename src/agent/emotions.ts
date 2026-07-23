/**
 * Leela's emotional range. Each reply is tagged with one of these (see
 * systemPrompt), which drives her face icon and the chat background art.
 */
export const EMOTIONS = [
  "neutral",
  "happy",
  "gentle",
  "excited",
  "proud",
  "concerned",
  "comforting",
  "thinking",
  "playful",
  "mischievous",
  "laughing",
  "surprised",
  "sleepy",
  "loving",
  "shy",
  "sad",
  "focused",
] as const;

export type Emotion = (typeof EMOTIONS)[number];

export function isEmotion(x: string): x is Emotion {
  return (EMOTIONS as readonly string[]).includes(x);
}

const TAG_RE = /^\s*\[\[\s*([a-zA-Z]+)\s*\]\]\s*/;

/**
 * Pull a leading `[[emotion]]` tag off a message. Returns the resolved emotion
 * (falling back to "neutral" for a missing/unknown tag) and the message text
 * with the tag removed.
 */
export function extractEmotion(content: string): { emotion: Emotion; text: string } {
  const match = content.match(TAG_RE);
  if (!match) return { emotion: "neutral", text: content };
  const key = match[1].toLowerCase();
  const emotion = isEmotion(key) ? key : "neutral";
  return { emotion, text: content.slice(match[0].length) };
}

const base = import.meta.env.BASE_URL;
const facePath = (name: string) => `${base}assets/faces/${name}`;

/** Leela's constant identity face (orb + chat header). */
export const ICON_SRC = facePath("icon.webp");
/** Guaranteed-present background used as the universal fallback. */
export const NEUTRAL_SRC = facePath("neutral-1.webp");

/** How many variants exist per emotion; default 1. Bump when you add more. */
const VARIANT_COUNTS: Partial<Record<Emotion, number>> = {
  neutral: 2,
  happy: 2,
  excited: 1,
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
