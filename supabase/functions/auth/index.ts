// POST /auth/login { password } → { token }
// One-user app: compares against APP_PASSWORD, issues HS256 JWT without expiry.

import { preflight, json } from "../_shared/cors.ts";
import { sign } from "../_shared/jwt.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });

  const APP_PASSWORD = Deno.env.get("APP_PASSWORD");
  const JWT_SECRET = Deno.env.get("JWT_SECRET");
  if (!APP_PASSWORD || !JWT_SECRET) {
    return json({ error: "server_misconfigured" }, { status: 500 });
  }

  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {}

  if (!body.password) return json({ error: "missing_password" }, { status: 400 });

  // Constant-time-ish comparison to avoid trivial timing leaks.
  const a = new TextEncoder().encode(body.password);
  const b = new TextEncoder().encode(APP_PASSWORD);
  if (a.length !== b.length) return json({ error: "unauthorized" }, { status: 401 });
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  if (diff !== 0) return json({ error: "unauthorized" }, { status: 401 });

  const token = await sign({ sub: "owner" }, JWT_SECRET);
  return json({ token });
});
