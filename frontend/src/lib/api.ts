let _token: string | null = null;
let _clerkTokenGetter: (() => Promise<string | null>) | null = null;

export function getToken(): string | null {
  return _token;
}

export function setToken(token: string) {
  _token = token;
}

/** Register Clerk token getter (called from App via useAuth hook) */
export function setClerkTokenGetter(getter: () => Promise<string | null>) {
  _clerkTokenGetter = getter;
}

export async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };

  // Prefer Clerk token if available
  if (_clerkTokenGetter) {
    try {
      const clerkToken = await _clerkTokenGetter();
      if (clerkToken) {
        headers["Authorization"] = `Bearer ${clerkToken}`;
        return headers;
      }
    } catch {
      // Fall through to session token
    }
  }

  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  return headers;
}

/** Sync version for contexts where async isn't possible (e.g. FormData uploads) */
export function authHeadersSync(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  return headers;
}

export async function initSession(): Promise<{ token: string; thread_id: string }> {
  const headers = await authHeaders();
  const res = await fetch("/session", { method: "POST", headers });
  if (!res.ok) throw new Error(`Session init failed: ${res.status}`);
  const data = await res.json();
  _token = data.token;
  return data;
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(path, { headers });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(path, {
    method: "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(path, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}
