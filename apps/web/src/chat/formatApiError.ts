import { ApiError } from "../api/client";

export type FormattedError = {
  message: string;
  hint?: string;
  technical?: string;
};

type ErrorBody = {
  error?: string;
  message?: string;
  detail?: string;
  retry_after_sec?: number;
};

function parseRetrySeconds(detail: string): number | undefined {
  const m = detail.match(/retry(?:Delay)?["']?\s*:\s*"?(\d+)/i);
  if (m) return Number(m[1]);
  const m2 = detail.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (m2) return Math.ceil(Number(m2[1]));
  return undefined;
}

function parseGeminiFromDetail(detail: string): {
  quota?: boolean;
  retrySec?: number;
  geminiMessage?: string;
} {
  const jsonStart = detail.indexOf("{");
  if (jsonStart < 0) return {};
  try {
    const parsed = JSON.parse(detail.slice(jsonStart)) as {
      error?: { code?: number; status?: string; message?: string; details?: Array<Record<string, unknown>> };
    };
    const err = parsed.error;
    if (!err) return {};
    const quota =
      err.status === "RESOURCE_EXHAUSTED" ||
      err.code === 429 ||
      /quota/i.test(err.message || "");
    let retrySec: number | undefined;
    for (const d of err.details || []) {
      const delay = d.retryDelay ?? d.retry_delay;
      if (typeof delay === "string") {
        const n = Number(delay.replace(/s$/i, ""));
        if (Number.isFinite(n)) retrySec = Math.ceil(n);
      }
    }
    if (retrySec == null) retrySec = parseRetrySeconds(detail);
    return { quota, retrySec, geminiMessage: err.message };
  } catch {
    return { quota: /RESOURCE_EXHAUSTED|quota exceeded/i.test(detail), retrySec: parseRetrySeconds(detail) };
  }
}

function fromBody(status: number, body: ErrorBody): FormattedError | null {
  const detail = typeof body.detail === "string" ? body.detail : "";
  const gemini = detail ? parseGeminiFromDetail(detail) : {};

  if (body.error === "llm_quota_exceeded" || gemini.quota) {
    const sec = body.retry_after_sec ?? gemini.retrySec ?? 60;
    return {
      message: body.message || "Квота Google Gemini исчерпана",
      hint: `Подожди ~${sec} сек и попробуй снова. На бесплатном тарифе лимит ~20 запросов в минуту. Billing: aistudio.google.com`,
      technical: detail || JSON.stringify(body, null, 2),
    };
  }

  if (body.error === "llm_failed") {
    return {
      message: "Не удалось обработать сообщение (ошибка ИИ)",
      hint: gemini.geminiMessage
        ? gemini.geminiMessage
        : "Попробуй через минуту или проверь GEMINI_API_KEY в Supabase secrets.",
      technical: detail || JSON.stringify(body, null, 2),
    };
  }

  if (body.error === "server_misconfigured") {
    return {
      message: "Сервер не настроен",
      hint: "На Supabase не заданы GEMINI_API_KEY, JWT_SECRET или APP_PASSWORD.",
      technical: JSON.stringify(body, null, 2),
    };
  }

  if (status === 401 || body.error === "unauthorized") {
    return {
      message: "Сессия истекла или неверный пароль",
      hint: "Выйди и войди снова (кнопка logout в чате).",
    };
  }

  if (body.message && typeof body.message === "string") {
    return {
      message: body.message,
      hint: body.error ? `код: ${body.error}` : undefined,
      technical: detail || JSON.stringify(body, null, 2),
    };
  }

  return null;
}

/** Human-readable Russian error for chat / API failures. */
export function formatApiError(err: unknown): FormattedError {
  if (err instanceof ApiError) {
    const body = (typeof err.body === "object" && err.body !== null ? err.body : {}) as ErrorBody;
    const parsed = fromBody(err.status, body);
    if (parsed) return parsed;

    if (err.status === 502 || err.status === 503) {
      return {
        message: "Сервер временно недоступен",
        hint: `HTTP ${err.status}. Подожди и повтори, или проверь деплой edge functions.`,
        technical: JSON.stringify(err.body, null, 2),
      };
    }

    return {
      message: `Ошибка API (${err.status})`,
      hint: typeof body.error === "string" ? body.error : undefined,
      technical: JSON.stringify(err.body, null, 2),
    };
  }

  if (err instanceof Error) {
    if (err.message === "Failed to fetch") {
      return {
        message: "Нет связи с сервером",
        hint: "Проверь интернет и VITE_FUNCTIONS_URL (GitHub Secrets). Edge function могла не задеплоиться.",
      };
    }
    if (err.message.includes("VITE_FUNCTIONS_URL")) {
      return { message: "Не настроен адрес API", hint: err.message };
    }
    return { message: err.message };
  }

  return { message: "Неизвестная ошибка", technical: String(err) };
}
