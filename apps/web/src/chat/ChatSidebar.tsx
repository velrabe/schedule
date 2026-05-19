import { useEffect, useRef, useState } from "preact/hooks";
import { call, ApiError } from "../api/client";
import { clearToken } from "../api/token";

type Action = {
  type: string;
  data: Record<string, unknown>;
};

type Message =
  | { id: string; role: "user"; text: string; ts: number }
  | {
      id: string;
      role: "assistant";
      text: string;
      ts: number;
      actions?: Action[];
      pendingId?: string;
      status?: "pending" | "confirmed" | "rejected" | "saved" | "error";
    };

type ChatResponse = {
  reply_to_user: string;
  actions: Action[];
  needs_confirmation: boolean;
  raw_log_id: string;
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)));
  } catch {}
}

export default function ChatSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: Message = { id: uid(), role: "user", text, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);
    try {
      const res = await call<ChatResponse>("chat", { message: text });
      const assistantMsg: Message = {
        id: uid(),
        role: "assistant",
        text: res.reply_to_user,
        actions: res.actions,
        pendingId: res.raw_log_id,
        status: res.needs_confirmation ? "pending" : "saved",
        ts: Date.now(),
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err) {
      const text = err instanceof ApiError ? `error ${err.status}: ${JSON.stringify(err.body)}` : (err instanceof Error ? err.message : "unknown error");
      setMessages((m) => [
        ...m,
        { id: uid(), role: "assistant", text, status: "error", ts: Date.now() },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (msgId: string, accept: boolean) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || msg.role !== "assistant" || !msg.pendingId) return;
    setBusy(true);
    try {
      await call("confirm", {
        raw_log_id: msg.pendingId,
        decision: accept ? "confirm" : "reject",
      });
      setMessages((arr) =>
        arr.map((m) =>
          m.id === msgId ? { ...m, status: accept ? "saved" : "rejected" } : m,
        ),
      );
    } catch (err) {
      setMessages((arr) =>
        arr.map((m) => (m.id === msgId ? { ...m, status: "error" } : m)),
      );
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
            <span class="chat-header-subtitle">type or paste anything</span>
          </div>
          <div class="chat-header-actions-wrap">
            <button class="btn btn--ghost btn--icon" onClick={clear} title="clear history">
              <span class="btn__icon-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </span>
            </button>
            <button class="btn btn--ghost btn--icon" onClick={logout} title="logout">
              <span class="btn__icon-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </span>
            </button>
            <button class="btn btn--ghost btn--icon" onClick={onClose} title="close (Esc)">
              <span class="btn__icon-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
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
                «начал приложение», «поел пасту», «вес 82.4», «75 мг модафинила»
              </span>
            </div>
          )}
          {messages.map((m) => (
            <ChatBubble key={m.id} msg={m} onDecide={decide} />
          ))}
        </div>

        <div class="chat-input-wrap">
          <textarea
            ref={textareaRef}
            class="chat-textarea"
            placeholder="напиши что-нибудь… enter — отправить, shift+enter — перенос"
            value={input}
            onInput={(e) => setInput((e.currentTarget as HTMLTextAreaElement).value)}
            onKeyDown={onKey}
            rows={2}
            disabled={busy}
          ></textarea>
          <div class="chat-input-actions-wrap">
            <span class="chat-input-hint">⌘/ — toggle · esc — close</span>
            <button
              class="btn btn--primary"
              onClick={send}
              disabled={busy || !input.trim()}
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

function ChatBubble({ msg, onDecide }: { msg: Message; onDecide: (id: string, accept: boolean) => void }) {
  if (msg.role === "user") {
    return (
      <div class="chat-row chat-row--user">
        <div class="chat-bubble chat-bubble--user">
          <span class="chat-bubble__text">{msg.text}</span>
        </div>
      </div>
    );
  }

  const showButtons = msg.status === "pending" && msg.actions && msg.actions.length > 0;
  const statusLabel: Record<NonNullable<typeof msg.status>, string> = {
    pending: "ждёт подтверждения",
    confirmed: "подтверждено",
    saved: "записано",
    rejected: "отклонено",
    error: "ошибка",
  };

  return (
    <div class="chat-row chat-row--assistant">
      <div class="chat-bubble chat-bubble--assistant">
        <span class="chat-bubble__text">{msg.text}</span>
        {msg.actions && msg.actions.length > 0 && (
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
        )}
        <div class="chat-bubble__meta-wrap">
          {msg.status && (
            <span class={`chat-bubble__status chat-bubble__status--${msg.status}`}>
              {statusLabel[msg.status]}
            </span>
          )}
          {showButtons && (
            <div class="chat-confirm-wrap">
              <button class="btn btn--primary" onClick={() => onDecide(msg.id, true)} type="button">
                <span class="btn__text-wrap">да</span>
              </button>
              <button class="btn" onClick={() => onDecide(msg.id, false)} type="button">
                <span class="btn__text-wrap">нет</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
