// POST /auth/login { password } → { token }
// POST /auth/login { api_key } → { token }  (when AGENT_API_KEY is set on the server)
// One-user app: compares against APP_PASSWORD / AGENT_API_KEY, issues HS256 JWT without expiry.

import { preflight, json } from "../_shared/cors.ts";
import { sign } from "../_shared/jwt.ts";

function safeEqual(a: string, b: string): boolean {
  const ae = new TextEncoder().encode(a);
  const be = new TextEncoder().encode(b);
  if (ae.length !== be.length) return false;
  let diff = 0;
  for (let i = 0; i < ae.length; i++) diff |= (ae[i] ?? 0) ^ (be[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });

  const APP_PASSWORD = Deno.env.get("APP_PASSWORD");
  const JWT_SECRET = Deno.env.get("JWT_SECRET");
  if (!APP_PASSWORD || !JWT_SECRET) {
    return json({ error: "server_misconfigured" }, { status: 500 });
  }

  let body: { password?: string; api_key?: string } = {};
  try {
    body = await req.json();
  } catch {}

  if (body.api_key) {
    const AGENT_API_KEY = Deno.env.get("AGENT_API_KEY");
    if (!AGENT_API_KEY) {
      return json({ error: "agent_key_not_configured" }, { status: 501 });
    }
    if (!safeEqual(body.api_key, AGENT_API_KEY)) {
      return json({ error: "unauthorized" }, { status: 401 });
    }
    const token = await sign({ sub: "agent", scope: "write" }, JWT_SECRET);
    return json({ token });
  }

  if (!body.password) return json({ error: "missing_password" }, { status: 400 });

  if (!safeEqual(body.password, APP_PASSWORD)) {
    return json({ error: "unauthorized" }, { status: 401 });
  }

  const token = await sign({ sub: "owner" }, JWT_SECRET);
  return json({ token });
});
