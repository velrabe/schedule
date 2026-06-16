import { useEffect, useRef, useState } from "preact/hooks";
import { call, ApiError } from "../api/client";
import { clearToken } from "../api/token";
import { summarizeActions } from "./actionSummary";
import { formatApiError } from "./formatApiError";
import { prepareImageFile, isImagePasteItem, type PreparedImage } from "./imageAttach";
import { looksLikeDayLog } from "./dayLogDetect";

export type Action = {
  type: string;
  data: Record<string, unknown>;
};

type ConfirmResult = { type: string; ok: boolean; error?: string };

type SwallowWarning = { victim_id: string; message: string; victim_label?: string };

type Message =
  | { id: string; role: "user"; text: string; ts: number; imagePreview?: string; imageName?: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      ts: number;
      actions?: Action[];
      pendingId?: string;
      status?: "pending" | "confirmed" | "saved" | "rejected" | "error";
      confirmNote?: string;
      errorHint?: string;
      errorTechnical?: string;
      swallowWarnings?: SwallowWarning[];
      needsSwallowOk?: boolean;
    }
  | { id: string; role: "assistant"; text: string; ts: number; status: "loading" };

type ChatResponse = {
  reply_to_user: string;
  actions: Action[];
  needs_confirmation: boolean;
  raw_log_id: string;
  swallow_warnings?: SwallowWarning[];
};

type ConfirmResponse = {
  ok: boolean;
  results: ConfirmResult[];
  error?: string;
  warnings?: SwallowWarning[];
};

const STORAGE_KEY = "schedule:chat-history";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Message[];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    const toSave = messages.filter((m) => !("status" in m) || m.status !== "loading");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave.slice(-100)));
  } catch {}
}

function formatConfirmNote(results: ConfirmResult[]): string {
  const real = results.filter((r) => r.type !== "ask_clarification");
  const clarifyOnly = results.length > 0 && real.length === 0;
  if (clarifyOnly) {
    return "В базу ничего не записано — это был только вопрос. Напишите ответ в чате (история учитывается).";
  }
  const ok = real.filter((r) => r.ok);
  const fail = real.filter((r) => !r.ok);
  if (fail.length === 0) {
    return real.length === 0
      ? "Готово."
      : `Записано: ${ok.length} из ${real.length}.`;
  }
  const lines = fail.map((r) => `${r.type}: ${r.error || "ошибка"}`);
  return `Частично: ${ok.length} ок, ${fail.length} ошибок.\n${lines.join("\n")}`;
}

export default function ChatSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingImages, setPendingImages] = useState<PreparedImage[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus();
  }, [open]);

  const attachFile = async (file: File) => {
    setImageBusy(true);
    try {
      const prepared = await prepareImageFile(file);
      setPendingImages((prev) => [...prev, prepared].slice(0, 8));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setImageBusy(false);
    }
  };

  const onPickImage = () => fileInputRef.current?.click();

  const onFileChange = (e: Event) => {
    const inputEl = e.currentTarget as HTMLInputElement;
    const files = inputEl.files;
    if (files?.length) {
      for (const file of files) void attachFile(file);
    }
    inputEl.value = "";
  };

  const onPaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (isImagePasteItem(item)) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void attachFile(file);
        }
        break;
      }
    }
  };

  const send = async () => {
    const text = input.trim();
    const imgs = pendingImages;
    if ((!text && !imgs.length) || busy || imageBusy) return;
    const userMsg: Message = {
      id: uid(),
      role: "user",
      text: text || (imgs.length ? `📷 ${imgs.length} скрин(ов)` : ""),
      ts: Date.now(),
      imagePreview: imgs[0]?.previewUrl,
      imageName: imgs.length > 1 ? `${imgs.length} images` : imgs[0]?.name,
    };
    const loadingId = uid();
    const loadingMsg: Message = {
      id: loadingId,
      role: "assistant",
      text: looksLikeDayLog(text) ? "разбираю день…" : "думаю…",
      status: "loading",
      ts: Date.now(),
    };
    setMessages((m) => [...m, userMsg, loadingMsg]);
    setInput("");
    setPendingImages([]);
    setBusy(true);
    try {
      const history = messages
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.status !== "loading"))
        .slice(-8)
        .map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));

      const useParser = looksLikeDayLog(text);
      const endpoint = useParser ? "parse-day" : "chat";
      const payload = useParser
        ? {
            message: text,
            images: imgs.map((img) => ({ base64: img.base64, mime: img.mime })),
          }
        : {
            message: text,
            history,
            ...(imgs[0] ? { image_base64: imgs[0].base64, image_mime: imgs[0].mime } : {}),
          };

      const res = await call<ChatResponse>(endpoint, payload);
      const assistantMsg: Message = {
        id: uid(),
        role: "assistant",
        text: res.reply_to_user,
        actions: res.actions,
        pendingId: res.raw_log_id,
        status: res.needs_confirmation ? "pending" : "saved",
        swallowWarnings: res.swallow_warnings,
        needsSwallowOk: (res.swallow_warnings?.length ?? 0) > 0,
        ts: Date.now(),
      };
      setMessages((m) => [...m.filter((x) => x.id !== loadingId), assistantMsg]);

      if (!res.needs_confirmation && res.raw_log_id) {
        try {
          const confirmRes = await call<ConfirmResponse>("confirm", {
            raw_log_id: res.raw_log_id,
            decision: "confirm",
          });
          window.dispatchEvent(new CustomEvent("schedule:data-changed"));
          setMessages((arr) =>
            arr.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    status: confirmRes.ok ? "saved" : "error",
                    confirmNote: formatConfirmNote(confirmRes.results || []),
                  }
                : m,
            ),
          );
        } catch (_) {
          setMessages((arr) =>
            arr.map((m) => (m.id === assistantMsg.id ? { ...m, status: "error" } : m)),
          );
        }
      }
    } catch (err) {
      const fe = formatApiError(err);
      setMessages((m) => [
        ...m.filter((x) => x.id !== loadingId),
        {
          id: uid(),
          role: "assistant",
          text: fe.message,
          errorHint: fe.hint,
          errorTechnical: fe.technical,
          status: "error",
          ts: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (msgId: string, accept: boolean, swallowOk = false) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || msg.role !== "assistant" || msg.status === "loading") return;
    if (!("pendingId" in msg) || !msg.pendingId) return;
    setBusy(true);
    try {
      const confirmRes = await call<ConfirmResponse>("confirm", {
        raw_log_id: msg.pendingId,
        decision: accept ? "confirm" : "reject",
        swallow_ok: swallowOk,
      });
      setMessages((arr) =>
        arr.map((m) =>
          m.id === msgId
            ? {
                ...m,
                status: accept ? (confirmRes.ok ? "saved" : "error") : "rejected",
                confirmNote: accept ? formatConfirmNote(confirmRes.results || []) : undefined,
                needsSwallowOk: false,
              }
            : m,
        ),
      );
      if (accept) {
        window.dispatchEvent(new CustomEvent("schedule:data-changed"));
      }
    } catch (err) {
      if (accept && err instanceof ApiError && err.status === 409) {
        const body = err.body as { warnings?: SwallowWarning[] };
        const warnings = body?.warnings ?? [];
        setMessages((arr) =>
          arr.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  status: "pending",
                  needsSwallowOk: true,
                  swallowWarnings: warnings,
                  confirmNote: warnings.map((w) => w.message).join("\n"),
                }
              : m,
          ),
        );
      } else {
        const fe = formatApiError(err);
        setMessages((arr) =>
          arr.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  status: "error",
                  text: fe.message,
                  errorHint: fe.hint,
                  errorTechnical: fe.technical,
                  confirmNote: undefined,
                }
              : m,
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const clear = () => {
    if (window.confirm("Очистить историю чата (только локально)?")) {
      setMessages([]);
    }
  };

  const logout = () => {
    if (window.confirm("Выйти? Будет сброшен токен на этом устройстве.")) {
      clearToken();
    }
  };

  return (
    <>
      <div
        class={`chat-overlay ${open ? "chat-overlay--open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      ></div>
      <aside class={`chat-sidebar ${open ? "chat-sidebar--open" : ""}`} aria-hidden={!open}>
        <div class="chat-header-wrap">
          <div class="chat-header-title-wrap">
            <span class="chat-header-title">log</span>
            <span class="chat-header-subtitle">день = парсер · короткое = chat · до 8 скринов</span>
          </div>
          <div class="chat-header-actions-wrap">
            <button class="btn btn--ghost btn--icon" onClick={clear} title="clear history" type="button">
              <span class="btn__icon-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </span>
            </button>
            <button class="btn btn--ghost btn--icon" onClick={logout} title="logout" type="button">
              <span class="btn__icon-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </span>
            </button>
            <button class="btn btn--ghost btn--icon" onClick={onClose} title="close (Esc)" type="button">
              <span class="btn__icon-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </span>
            </button>
          </div>
        </div>

        <div class="chat-list-wrap" ref={listRef}>
          {messages.length === 0 && (
            <div class="chat-empty-wrap">
              <span class="chat-empty-title">empty</span>
              <span class="chat-empty-hint">
                Полный день: дата + фазы + ивенты (+ вложения) → парсер. Короткое: «75 мг мода», «вес 82.4»
              </span>
            </div>
          )}
          {messages.map((m) => (
            <ChatBubble key={m.id} msg={m} onDecide={decide} busy={busy} />
          ))}
        </div>

        <div class="chat-input-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            class="chat-file-input"
            onChange={onFileChange}
          />
          {pendingImages.length > 0 && (
            <div class="chat-attach-preview-wrap">
              <div class="chat-attach-preview-list-wrap">
                {pendingImages.map((img, idx) => (
                  <div key={idx} class="chat-attach-preview-item-wrap">
                    <img class="chat-attach-preview-img" src={img.previewUrl} alt="" />
                    <button
                      type="button"
                      class="btn btn--ghost btn--icon"
                      onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                      disabled={busy}
                      title="убрать"
                    >
                      <span class="btn__icon-wrap">×</span>
                    </button>
                  </div>
                ))}
              </div>
              <div class="chat-attach-preview-meta-wrap">
                <span class="chat-attach-preview-name">{pendingImages.length} скрин(ов)</span>
                <button
                  type="button"
                  class="btn btn--ghost"
                  onClick={() => setPendingImages([])}
                  disabled={busy}
                >
                  <span class="btn__text-wrap">убрать все</span>
                </button>
              </div>
            </div>
          )}
          <textarea
            ref={textareaRef}
            class="chat-textarea"
            placeholder="полный день текстом + скрины Grab/ккал/спорт… enter — отправить"
            value={input}
            onInput={(e) => setInput((e.currentTarget as HTMLTextAreaElement).value)}
            onKeyDown={onKey}
            onPaste={onPaste}
            rows={4}
            disabled={busy || imageBusy}
          ></textarea>
          <div class="chat-input-actions-wrap">
            <button
              type="button"
              class="btn btn--ghost btn--icon"
              onClick={onPickImage}
              disabled={busy || imageBusy}
              title="прикрепить изображение"
            >
              <span class="btn__icon-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="8.5" cy="10" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </span>
            </button>
            <span class="chat-input-hint">
              {busy ? "обрабатываю…" : imageBusy ? "сжимаю…" : "⌘/ — toggle"}
            </span>
            <button
              class="btn btn--primary"
              onClick={() => void send()}
              disabled={busy || imageBusy || (!input.trim() && !pendingImages.length)}
              type="button"
            >
              <span class="btn__text-wrap">{busy ? "…" : "send"}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function ChatBubble({
  msg,
  onDecide,
  busy,
}: {
  msg: Message;
  onDecide: (id: string, accept: boolean, swallowOk?: boolean) => void;
  busy: boolean;
}) {
  if (msg.role === "user") {
    return (
      <div class="chat-row chat-row--user">
        <div class="chat-bubble chat-bubble--user">
          {msg.imagePreview && (
            <div class="chat-bubble-image-wrap">
              <img
                class="chat-bubble-image"
                src={msg.imagePreview}
                alt={msg.imageName || "image"}
              />
            </div>
          )}
          {msg.text && <span class="chat-bubble__text">{msg.text}</span>}
        </div>
      </div>
    );
  }

  if (msg.status === "loading") {
    return (
      <div class="chat-row chat-row--assistant">
        <div class="chat-bubble chat-bubble--assistant chat-bubble--loading">
          <div class="chat-loading-wrap">
            <span class="chat-loading-dot"></span>
            <span class="chat-loading-dot"></span>
            <span class="chat-loading-dot"></span>
          </div>
          <span class="chat-bubble__text chat-bubble__text--muted">{msg.text}</span>
        </div>
      </div>
    );
  }

  const writableActions = msg.actions?.filter((a) => a.type !== "ask_clarification") ?? [];
  const clarifyActions = msg.actions?.filter((a) => a.type === "ask_clarification") ?? [];
  const showButtons = msg.status === "pending" && writableActions.length > 0;
  const statusLabel: Record<string, string> = {
    pending: "ждёт подтверждения",
    confirmed: "подтверждено",
    saved: "записано",
    rejected: "отклонено",
    error: "ошибка",
  };
  const writableSummaries = writableActions.length ? summarizeActions(writableActions) : [];
  const clarifySummaries = clarifyActions.length ? summarizeActions(clarifyActions) : [];

  const isError = msg.status === "error";

  return (
    <div class="chat-row chat-row--assistant">
      <div class={`chat-bubble chat-bubble--assistant ${isError ? "chat-bubble--error" : ""}`}>
        <span class={`chat-bubble__text ${isError ? "chat-bubble__text--error-title" : ""}`}>{msg.text}</span>
        {msg.errorHint && (
          <div class="chat-error-hint-wrap">
            <span class="chat-error-hint">{msg.errorHint}</span>
          </div>
        )}
        {msg.errorTechnical && (
          <details class="chat-actions-details chat-actions-details--error">
            <summary class="chat-actions-details__summary">
              <span>технические детали</span>
            </summary>
            <pre class="chat-error-technical">{msg.errorTechnical}</pre>
          </details>
        )}

        {writableSummaries.length > 0 && (
          <div class="chat-actions-human-wrap">
            <span class="chat-actions-human-title">будет записано:</span>
            <ul class="chat-actions-human-list">
              {writableSummaries.map((line, i) => (
                <li key={i} class="chat-actions-human-item">
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {clarifySummaries.length > 0 && (
          <div class="chat-actions-human-wrap chat-actions-human-wrap--clarify">
            <span class="chat-actions-human-title">нужно уточнение (в БД не пишется):</span>
            <ul class="chat-actions-human-list">
              {clarifySummaries.map((line, i) => (
                <li key={i} class="chat-actions-human-item">
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {msg.actions && msg.actions.length > 0 && (
          <details class="chat-actions-details">
            <summary class="chat-actions-details__summary">
              <span>технические детали (JSON)</span>
            </summary>
            <div class="chat-actions-preview-wrap">
              {msg.actions.map((a, i) => (
                <div key={i} class="chat-action-card">
                  <div class="chat-action-card__head">
                    <span class="chat-action-card__type">{a.type}</span>
                  </div>
                  <pre class="chat-action-card__body">{JSON.stringify(a.data, null, 2)}</pre>
                </div>
              ))}
            </div>
          </details>
        )}

        <div class="chat-bubble__meta-wrap">
          {msg.status && (
            <span class={`chat-bubble__status chat-bubble__status--${msg.status}`}>
              {statusLabel[msg.status] ?? msg.status}
            </span>
          )}
          {msg.confirmNote && <span class="chat-bubble__confirm-note">{msg.confirmNote}</span>}
          {showButtons && (
            <div class="chat-confirm-wrap">
              {msg.needsSwallowOk ? (
                <button
                  class="btn btn--primary"
                  onClick={() => onDecide(msg.id, true, true)}
                  type="button"
                  disabled={busy}
                >
                  <span class="btn__text-wrap">да, поглотить</span>
                </button>
              ) : (
                <button
                  class="btn btn--primary"
                  onClick={() => onDecide(msg.id, true, false)}
                  type="button"
                  disabled={busy}
                >
                  <span class="btn__text-wrap">да</span>
                </button>
              )}
              <button class="btn" onClick={() => onDecide(msg.id, false)} type="button" disabled={busy}>
                <span class="btn__text-wrap">нет</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
