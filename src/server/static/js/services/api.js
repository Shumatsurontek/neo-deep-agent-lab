/* ── Session token management ────────────────── */
let _sessionToken = null;

export async function initSession() {
    try {
        const res = await fetch('/session', { method: 'POST' });
        const data = await res.json();
        _sessionToken = data.token;
    } catch (e) { console.error('Failed to create session', e); }
}

export function authHeaders(extra = {}) {
    const h = { ...extra };
    if (_sessionToken) h['Authorization'] = `Bearer ${_sessionToken}`;
    return h;
}

export function getToken() { return _sessionToken; }
export function setToken(t) { _sessionToken = t; }
