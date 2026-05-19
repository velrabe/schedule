import { useState } from "preact/hooks";
import { call, ApiError } from "../api/client";
import { setToken } from "../api/token";

type AuthResponse = { token: string };

export default function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await call<AuthResponse>("auth/login", { password });
      if (!res.token) throw new Error("No token in response");
      setToken(res.token);
      onAuth();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Wrong password.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="auth-gate-wrap">
      <div class="auth-card-wrap">
        <div class="auth-card-header-wrap">
          <span class="auth-card-title">schedule</span>
          <span class="auth-card-subtitle">one password. logged in forever.</span>
        </div>
        <form class="auth-form-wrap" onSubmit={submit}>
          <div class="auth-field-wrap">
            <input
              type="password"
              class="auth-input"
              placeholder="password"
              autoComplete="current-password"
              value={password}
              onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)}
              autoFocus
            />
          </div>
          {error && (
            <div class="auth-error-wrap">
              <span class="auth-error-text">{error}</span>
            </div>
          )}
          <div class="auth-actions-wrap">
            <button class="btn btn--primary" type="submit" disabled={loading || !password}>
              <span class="btn__text-wrap">{loading ? "checking…" : "enter"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
