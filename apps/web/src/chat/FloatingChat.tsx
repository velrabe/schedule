import { useEffect, useState } from "preact/hooks";
import ChatSidebar from "./ChatSidebar";

const OPEN_KEY = "schedule:chat-open";

export default function FloatingChat() {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        class={`chat-fab ${open ? "chat-fab--hidden" : ""}`}
        onClick={() => setOpen(true)}
        title="open chat (⌘/)"
        aria-label="open chat"
      >
        <span class="chat-fab__icon-wrap">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </span>
      </button>
      <ChatSidebar open={open} onClose={() => setOpen(false)} />
    </>
  );
}
