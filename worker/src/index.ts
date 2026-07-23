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

interface SubRecord {
  subscription: PushTarget;
  /** check-in times in UTC "HH:MM". */
  times: string[];
  /** time -> "YYYY-MM-DD" (UTC) of the last push, to avoid resending. */
  lastFired?: Record<string, string>;
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

async function sendPush(
  env: Env,
  target: PushTarget,
): Promise<"ok" | "gone" | "error"> {
  try {
    const keys = await ApplicationServerKeys.fromJSON(JSON.parse(env.VAPID_JSON));
    const { headers, body, endpoint } = await generatePushHTTPRequest({
      applicationServerKeys: keys,
      payload: JSON.stringify({
        title: "Leela",
        body: "Time for your check-in. Tap to talk.",
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
      let payload: { subscription?: PushTarget; times?: string[] };
      try {
        payload = await request.json();
      } catch {
        return json({ error: "bad json" }, env, 400);
      }
      const sub = payload.subscription;
      if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
        return json({ error: "invalid subscription" }, env, 400);
      }
      const rec: SubRecord = {
        subscription: sub,
        times: Array.isArray(payload.times) ? payload.times : [],
        lastFired: {},
      };
      await env.SUBS.put(sub.endpoint, JSON.stringify(rec));
      return json({ ok: true }, env);
    }

    if (url.pathname === "/unregister" && request.method === "POST") {
      let payload: { endpoint?: string };
      try {
        payload = await request.json();
      } catch {
        return json({ error: "bad json" }, env, 400);
      }
      if (payload.endpoint) await env.SUBS.delete(payload.endpoint);
      return json({ ok: true }, env);
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

    const list = await env.SUBS.list();
    for (const key of list.keys) {
      const rec = (await env.SUBS.get(key.name, "json")) as SubRecord | null;
      if (!rec || !Array.isArray(rec.times)) continue;
      if (!rec.times.includes(cur)) continue;
      if (rec.lastFired?.[cur] === today) continue;

      const result = await sendPush(env, rec.subscription);
      if (result === "gone") {
        await env.SUBS.delete(key.name);
        continue;
      }
      rec.lastFired = { ...(rec.lastFired ?? {}), [cur]: today };
      await env.SUBS.put(key.name, JSON.stringify(rec));
    }
  },
};
