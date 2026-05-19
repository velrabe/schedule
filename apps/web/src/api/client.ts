import { getToken } from "./token";

const FUNCTIONS_URL: string =
  (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_FUNCTIONS_URL || "";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function call<T = unknown>(
  endpoint: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  if (!FUNCTIONS_URL) {
    throw new Error(
      "VITE_FUNCTIONS_URL is not set. Add it to .env.local (see README).",
    );
  }
  const token = getToken();
  const url = `${FUNCTIONS_URL.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}`, res.status, parsed);
  }
  return parsed as T;
}
