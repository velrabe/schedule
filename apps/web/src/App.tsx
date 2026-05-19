import { useEffect, useState } from "preact/hooks";
import AuthGate from "./auth/AuthGate";
import FloatingChat from "./chat/FloatingChat";
import ScheduleTracker from "./dashboard/ScheduleTracker.jsx";
import { useSupabaseSnapshot } from "./dashboard/supabase-bridge";
import { getToken } from "./api/token";

function Dashboard() {
  const { state, reload } = useSupabaseSnapshot();

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div class="boot-wrap">
        <span class="boot-text">loading…</span>
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <ScheduleTracker
        liveData={state.data}
        sourceBadge="LIVE"
        onReload={reload}
      />
    );
  }

  // empty or error → demo mode
  return (
    <>
      {state.status === "error" && (
        <div class="boot-banner-wrap">
          <span class="boot-banner-text">
            не удалось загрузить из Supabase: {state.error}. показан demo-набор.
          </span>
        </div>
      )}
      <ScheduleTracker sourceBadge="DEMO" onReload={reload} />
    </>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));

  useEffect(() => {
    const handler = () => setAuthed(Boolean(getToken()));
    window.addEventListener("storage", handler);
    window.addEventListener("schedule:auth-changed", handler as EventListener);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("schedule:auth-changed", handler as EventListener);
    };
  }, []);

  if (!authed) return <AuthGate onAuth={() => setAuthed(true)} />;

  return (
    <>
      <Dashboard />
      <FloatingChat />
    </>
  );
}
