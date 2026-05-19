import { useEffect, useState } from "preact/hooks";
import AuthGate from "./auth/AuthGate";
import FloatingChat from "./chat/FloatingChat";
import ScheduleTracker from "./dashboard/ScheduleTracker.jsx";
import { getToken } from "./api/token";

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
      <ScheduleTracker />
      <FloatingChat />
    </>
  );
}
