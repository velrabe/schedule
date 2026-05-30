import { spawnSync } from "node:child_process";

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function curlAvailable() {
  const r = spawnSync("curl", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

/** Codex/proxy: Node fetch often fails; curl -4 works. */
export function preferCurl() {
  const v = process.env.SCHEDULE_USE_CURL;
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return false;
}

function networkFetchError(err) {
  const parts = [
    err?.message,
    err?.cause?.message,
    err?.cause?.code,
  ].filter(Boolean);
  const s = parts.join(" ");
  return /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|network|certificate/i.test(s);
}

export async function httpPost(url, { headers = {}, body } = {}) {
  if (!preferCurl()) {
    try {
      return await httpPostFetch(url, { headers, body });
    } catch (err) {
      if (networkFetchError(err) && curlAvailable()) {
        return httpPostCurl(url, { headers, body });
      }
      throw err;
    }
  }
  return httpPostCurl(url, { headers, body });
}

async function httpPostFetch(url, { headers, body }) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = parseJson(text);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

function httpPostCurl(url, { headers, body }) {
  const args = [
    "-4",
    "-sS",
    "-X",
    "POST",
    url,
    "-H",
    "content-type: application/json",
    "-w",
    "\n%{http_code}",
  ];
  for (const [k, v] of Object.entries(headers)) {
    if (v != null && v !== "") args.push("-H", `${k}: ${v}`);
  }
  const payload = body != null ? JSON.stringify(body) : "{}";
  args.push("-d", payload);

  const r = spawnSync("curl", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`curl failed (${r.status}): ${r.stderr || r.stdout}`);
  }

  const raw = r.stdout ?? "";
  const nl = raw.lastIndexOf("\n");
  const statusLine = nl >= 0 ? raw.slice(nl + 1).trim() : "";
  const text = nl >= 0 ? raw.slice(0, nl) : raw;
  const status = Number(statusLine) || 0;
  const data = parseJson(text.trim());

  if (status < 200 || status >= 300) {
    const err = new Error(`HTTP ${status}`);
    err.status = status;
    err.body = data;
    throw err;
  }
  return data;
}
