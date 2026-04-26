import type { SessionState } from '../types/homebox';

const SESSION_KEY = 'homebox-scanner-session';
const SETTINGS_KEY = 'homebox-scanner-settings';

function parseSession(raw: string | null): SessionState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

function withoutSecrets(session: SessionState): SessionState {
  return {
    connection: session.connection,
    username: session.username,
    connected: false,
    rememberLogin: false
  };
}

export function loadSession(): SessionState | null {
  const tabSession = parseSession(sessionStorage.getItem(SESSION_KEY));
  if (tabSession) return tabSession;

  const storedSession = parseSession(localStorage.getItem(SESSION_KEY));
  if (!storedSession) return null;

  if (storedSession.rememberLogin === true) return storedSession;

  // Older builds wrote bearer tokens to localStorage unconditionally. Keep non-secret
  // connection conveniences, but actively remove any lingering token material.
  const sanitized = withoutSecrets(storedSession);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sanitized));
  return sanitized;
}

export function saveSession(session: SessionState, persistToken = false): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(SESSION_KEY, JSON.stringify(persistToken ? { ...session, rememberLogin: true } : withoutSecrets(session)));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function saveAppSetting<T>(key: string, value: T): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const current = raw ? JSON.parse(raw) : {};
    current[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
  } catch {
    // ignore storage failure
  }
}

export function loadAppSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const current = JSON.parse(raw);
    return (current[key] ?? fallback) as T;
  } catch {
    return fallback;
  }
}
