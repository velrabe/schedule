// Tiny JWT signer/verifier (HS256). One-user app, no rotation.

function b64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64UrlDecode(input: string): Uint8Array {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const bin = atob(input.replaceAll("-", "+").replaceAll("_", "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function sign(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64UrlEncode(JSON.stringify(header));
  const p = b64UrlEncode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const data = `${h}.${p}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${b64UrlEncode(sig)}`;
}

export async function verify<T = Record<string, unknown>>(
  token: string,
  secret: string,
): Promise<T | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const data = `${h}.${p}`;
  const key = await hmacKey(secret);
  const sig = b64UrlDecode(s);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(data),
  );
  if (!ok) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64UrlDecode(p))) as T;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, secret: string): Promise<Record<string, unknown> | Response> {
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return new Response("unauthorized", { status: 401 });
  const token = m[1]!;
  const payload = await verify(token, secret);
  if (!payload) return new Response("unauthorized", { status: 401 });
  return payload as Record<string, unknown>;
}
