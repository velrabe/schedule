const KEY = "schedule:auth-token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  localStorage.setItem(KEY, token);
  window.dispatchEvent(new CustomEvent("schedule:auth-changed"));
}

export function clearToken() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("schedule:auth-changed"));
}
