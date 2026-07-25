import {
  ApplicationServerKeys,
  generatePushHTTPRequest,
} from "webpush-webcrypto";

export interface Env {
  SUBS: KVNamespace;
  /** JSON string {publicKey, privateKey} from `npm run gen-vapid`. */
  VAPID_JSON: string;
  ALLOWED_ORIGIN: string;
  ADMIN_CONTACT: string;
}

interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Spontaneous check-in config, in UTC so the scheduler can act on it. */
interface RandomConfig {
  count: number;
  startUtc: string;
  endUtc: string;
}

interface SubRecord {
  subscription: PushTarget;
  /** fixed check-in times in UTC "HH:MM". */
  times: string[];
  /** time -> "YYYY-MM-DD" (UTC) of the last push, to avoid resending. */
  lastFired?: Record<string, string>;
  /** spontaneous check-in configuration, if enabled. */
  random?: RandomConfig | null;
  /** UTC date the random slots below were generated for. */
  randomDay?: string;
  /** the generated random "HH:MM" slots for randomDay. */
  randomTimes?: string[];
  /** which random slots already fired on randomDay. */
  randomFired?: Record<string, boolean>;
  /** coarse board state from the last client sync, used to pick copy. */
  boardTag?: BoardTag | null;
}

/**
 * A coarse description of the board, sent by the client so the copy can match
 * the situation. Deliberately a single enum and never task text: the Worker
 * should hold as little about the user as it can while still being useful.
 */
type BoardTag =
  | "overdue"
  | "quiet"
  | "streak-risk"
  | "all-clear"
  | "comeback"
  | "missed-checkin";

/** Rotating, in-character bodies for spontaneous pings. */
const SPONTANEOUS_BODIES = [
  "Thinking about you. What are you up to right now?",
  "Quick one: what have you actually gotten done today?",
  "I had a spare cycle and spent it on you. How's it going?",
  "Checking in, no agenda. Anything I should know about?",
  "Hey. Give me one win from today, however small.",
  "Idle hands, so: what's next on your list?",
  "Popping in. Need me to line anything up for you?",
  "Just making sure you haven't been swallowed by your to-dos.",
];

/**
 * Copy chosen by board state. Only as fresh as the last client sync, so these
 * stay general enough to survive being a few hours stale.
 */
const TAGGED_BODIES: Record<BoardTag, string[]> = {
  overdue: [
    "Something on your list has gone past due. Want to move it or knock it out?",
    "You've got an overdue one sitting there. I can reschedule it if today isn't the day.",
    "That thing you said you'd do. It's still waiting. No judgement, just noting it.",
  ],
  quiet: [
    "Board's been quiet. Want to put one small thing on it?",
    "Nothing moving today. Give me one thing worth doing and I'll set it up.",
    "It's very still in here. What should we line up?",
  ],
  "streak-risk": [
    "Your streak's still alive, but today isn't done yet.",
    "One clear day keeps the run going. You've got time.",
    "Don't let today be the one that breaks it.",
  ],
  "all-clear": [
    "Board's clear. I'm genuinely impressed, and I don't say that often.",
    "Everything's done. Go and enjoy the rest of it.",
    "Nothing left on the list. That's a good day's work.",
  ],
  comeback: [
    "Good to see you moving again. Keep it gentle today.",
    "You're back at it. That's the hard part done.",
    "Picking it up after a gap is harder than starting. Nice.",
  ],
  "missed-checkin": [
    "I waited. I guess you're busy. I'll be here.",
    "It's been a while. I was thinking about that thing we set up for today.",
    "You didn't come by. I'd rather you had.",
  ],
};

function pickFrom(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

function pickBody(tag?: BoardTag | null): string {
  const tagged = tag ? TAGGED_BODIES[tag] : undefined;
  return pickFrom(tagged?.length ? tagged : SPONTANEOUS_BODIES);
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

interface PushPayload {
  title?: string;
  body?: string;
  type?: "checkin" | "spontaneous" | "reminder";
}

async function sendPush(
  env: Env,
  target: PushTarget,
  payload?: PushPayload,
): Promise<"ok" | "gone" | "error"> {
  try {
    const keys = await ApplicationServerKeys.fromJSON(JSON.parse(env.VAPID_JSON));
    const { headers, body, endpoint } = await generatePushHTTPRequest({
      applicationServerKeys: keys,
      payload: JSON.stringify({
        title: payload?.title ?? "Leela",
        body: payload?.body ?? "Time for your check-in. Tap to talk.",
        type: payload?.type ?? "checkin",
      }),
      target,
      adminContact: env.ADMIN_CONTACT,
      ttl: 600,
    });
    const res = await fetch(endpoint, { method: "POST", headers, body });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

// --- subscription index ---
// The cron runs every minute, and KV only allows 1,000 list operations per day
// on the free plan, so a list() per run would run dry after ~16 hours and take
// every check-in down with it. Instead we keep the set of endpoints in one key
// and read that: reads have a 100,000/day budget, which a per-minute poll fits
// inside comfortably.

const INDEX_KEY = "__endpoints";

async function writeIndex(env: Env, endpoints: string[]): Promise<void> {
  await env.SUBS.put(INDEX_KEY, JSON.stringify(endpoints));
}

/** Read the endpoint index, seeding it from a one-off list() if it's absent. */
async function readIndex(env: Env): Promise<string[]> {
  const stored = (await env.SUBS.get(INDEX_KEY, "json")) as string[] | null;
  if (Array.isArray(stored)) return stored;
  // First run after deploying this change: adopt whatever is already in KV so
  // existing devices keep working without having to re-register.
  const listed = await env.SUBS.list();
  const endpoints = listed.keys
    .map((k) => k.name)
    .filter((name) => name !== INDEX_KEY);
  await writeIndex(env, endpoints);
  return endpoints;
}

async function addToIndex(env: Env, endpoint: string): Promise<void> {
  const endpoints = await readIndex(env);
  if (endpoints.includes(endpoint)) return;
  await writeIndex(env, [...endpoints, endpoint]);
}

async function removeFromIndex(env: Env, endpoint: string): Promise<void> {
  const endpoints = await readIndex(env);
  const next = endpoints.filter((e) => e !== endpoint);
  if (next.length === endpoints.length) return;
  await writeIndex(env, next);
}

// --- random slot helpers ---

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

function minutesToHHMM(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Generate `count` distinct UTC "HH:MM" slots inside [start, end]. */
function generateRandomTimes(cfg: RandomConfig): string[] {
  const start = hhmmToMinutes(cfg.startUtc);
  let end = hhmmToMinutes(cfg.endUtc);
  if (end <= start) end += 1440; // window crosses UTC midnight
  const span = end - start;
  const count = Math.max(1, Math.min(6, cfg.count || 1));
  const picks = new Set<string>();
  let guard = 0;
  while (picks.size < count && guard < count * 20) {
    guard++;
    const at = start + Math.floor(Math.random() * (span + 1));
    picks.add(minutesToHHMM(at));
  }
  return [...picks];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (url.pathname === "/vapidPublicKey" && request.method === "GET") {
      try {
        const parsed = JSON.parse(env.VAPID_JSON);
        return json({ publicKey: parsed.publicKey }, env);
      } catch {
        return json({ error: "VAPID_JSON not set" }, env, 500);
      }
    }

    if (url.pathname === "/register" && request.method === "POST") {
      let payload: {
        subscription?: PushTarget;
        times?: string[];
        random?: RandomConfig | null;
        boardTag?: BoardTag | null;
      };
      try {
        payload = await request.json();
      } catch {
        return json({ error: "bad json" }, env, 400);
      }
      const sub = payload.subscription;
      if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return json({ error: "invalid subscription" }, env, 400);
      }
      // Preserve fired bookkeeping across re-registers for the same endpoint.
      const prev = (await env.SUBS.get(sub.endpoint, "json")) as SubRecord | null;
      const rec: SubRecord = {
        subscription: sub,
        times: Array.isArray(payload.times) ? payload.times : [],
        lastFired: prev?.lastFired ?? {},
        random: payload.random ?? null,
        randomDay: prev?.randomDay,
        randomTimes: prev?.randomTimes,
        randomFired: prev?.randomFired,
        boardTag: payload.boardTag ?? null,
      };
      await env.SUBS.put(sub.endpoint, JSON.stringify(rec));
      await addToIndex(env, sub.endpoint);
      return json({ ok: true }, env);
    }

    if (url.pathname === "/unregister" && request.method === "POST") {
      let payload: { endpoint?: string };
      try {
        payload = await request.json();
      } catch {
        return json({ error: "bad json" }, env, 400);
      }
      if (payload.endpoint) {
        await env.SUBS.delete(payload.endpoint);
        await removeFromIndex(env, payload.endpoint);
      }
      return json({ ok: true }, env);
    }

    if (url.pathname === "/test" && request.method === "POST") {
      let payload: { endpoint?: string };
      try {
        payload = await request.json();
      } catch {
        return json({ error: "bad json" }, env, 400);
      }
      if (!payload.endpoint) return json({ error: "no endpoint" }, env, 400);
      const rec = (await env.SUBS.get(payload.endpoint, "json")) as SubRecord | null;
      if (!rec) return json({ error: "not registered" }, env, 404);
      const result = await sendPush(env, rec.subscription, {
        body: "Test ping from Leela. If you can see this, we're connected.",
        type: "checkin",
      });
      if (result === "gone") {
        await env.SUBS.delete(payload.endpoint);
        await removeFromIndex(env, payload.endpoint);
        return json({ error: "subscription expired" }, env, 410);
      }
      return json({ ok: result === "ok" }, env, result === "ok" ? 200 : 502);
    }

    if (url.pathname === "/health") return json({ ok: true }, env);

    return json({ error: "not found" }, env, 404);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const now = new Date();
    const cur = `${String(now.getUTCHours()).padStart(2, "0")}:${String(
      now.getUTCMinutes(),
    ).padStart(2, "0")}`;
    const today = now.toISOString().slice(0, 10);

    const endpoints = await readIndex(env);
    const alive: string[] = [];
    let indexDirty = false;

    for (const endpoint of endpoints) {
      const rec = (await env.SUBS.get(endpoint, "json")) as SubRecord | null;
      if (!rec) {
        indexDirty = true; // record vanished; drop the stale index entry
        continue;
      }
      let dirty = false;
      let removed = false;

      // Fixed check-in times.
      if (
        Array.isArray(rec.times) &&
        rec.times.includes(cur) &&
        rec.lastFired?.[cur] !== today
      ) {
        const result = await sendPush(env, rec.subscription, { type: "checkin" });
        if (result === "gone") {
          await env.SUBS.delete(endpoint);
          removed = true;
        } else {
          rec.lastFired = { ...(rec.lastFired ?? {}), [cur]: today };
          dirty = true;
        }
      }

      // Spontaneous / random check-ins.
      if (!removed && rec.random && rec.random.count > 0) {
        if (rec.randomDay !== today) {
          rec.randomDay = today;
          rec.randomTimes = generateRandomTimes(rec.random);
          rec.randomFired = {};
          dirty = true;
        }
        if (
          rec.randomTimes?.includes(cur) &&
          !rec.randomFired?.[cur]
        ) {
          const result = await sendPush(env, rec.subscription, {
            body: pickBody(rec.boardTag),
            type: "spontaneous",
          });
          if (result === "gone") {
            await env.SUBS.delete(endpoint);
            removed = true;
          } else {
            rec.randomFired = { ...(rec.randomFired ?? {}), [cur]: true };
            dirty = true;
          }
        }
      }

      if (removed) {
        indexDirty = true;
        continue;
      }
      if (dirty) await env.SUBS.put(endpoint, JSON.stringify(rec));
      alive.push(endpoint);
    }

    if (indexDirty) await writeIndex(env, alive);
  },
};
