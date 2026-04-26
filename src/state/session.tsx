import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { HomeboxHttpApi, type HomeboxApi } from '../lib/homebox/api';
import { MockHomeboxApi } from '../lib/homebox/mockApi';
import { clearSession, loadSession, saveSession } from '../lib/storage';
import type { ConnectionConfig, LoginForm, SessionState } from '../types/homebox';

interface SessionContextValue {
  session: SessionState;
  api: HomeboxApi;
  connectWithPassword(connection: ConnectionConfig, form: LoginForm, rememberLogin?: boolean): Promise<void>;
  connectMock(connection?: Partial<ConnectionConfig>): Promise<void>;
  logout(): void;
  setConnectionConfig(connection: ConnectionConfig): void;
}

const defaultBaseUrl = import.meta.env.VITE_HB_DEFAULT_BASE_URL || '';
const initialMock = String(import.meta.env.VITE_HB_MOCK_MODE || 'false').toLowerCase() === 'true';

const initialSession: SessionState = loadSession() ?? {
  connection: initialMock
    ? {
        baseUrl: defaultBaseUrl || window.location.origin,
        authMethod: 'mock',
        openEntityUrlTemplate: import.meta.env.VITE_HB_OPEN_ENTITY_URL_TEMPLATE || ''
      }
    : undefined,
  connected: initialMock
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren): JSX.Element {
  const [session, setSession] = useState<SessionState>(initialSession);

  const api = useMemo<HomeboxApi>(() => {
    if (session.connection?.authMethod === 'mock') {
      return new MockHomeboxApi();
    }

    if (session.connection) {
      return new HomeboxHttpApi(session.connection, session.token);
    }

    return new MockHomeboxApi();
  }, [session.connection, session.token]);

  async function connectWithPassword(connection: ConnectionConfig, form: LoginForm, rememberLogin = false): Promise<void> {
    const tempApi = new HomeboxHttpApi(connection);
    await tempApi.getStatus();

    const tokenResponse = await tempApi.login(form);
    tempApi.setToken(tokenResponse.token);
    await tempApi.getSelf();

    const next: SessionState = {
      connection,
      connected: true,
      token: tokenResponse.token,
      attachmentToken: tokenResponse.attachmentToken,
      expiresAt: tokenResponse.expiresAt,
      username: form.username,
      rememberLogin
    };

    setSession(next);
    saveSession(next, rememberLogin);
  }

  async function connectMock(connection?: Partial<ConnectionConfig>): Promise<void> {
    const next: SessionState = {
      connection: {
        baseUrl: connection?.baseUrl || defaultBaseUrl || window.location.origin,
        authMethod: 'mock',
        openEntityUrlTemplate: connection?.openEntityUrlTemplate || ''
      },
      connected: true,
      token: 'mock-token'
    };

    setSession(next);
    saveSession(next);
  }

  function logout(): void {
    clearSession();
    setSession({
      connected: false
    });
  }

  function setConnectionConfig(connection: ConnectionConfig): void {
    const next = {
      ...session,
      connection
    };
    setSession(next);
    saveSession(next);
  }

  return (
    <SessionContext.Provider
      value={{
        session,
        api,
        connectWithPassword,
        connectMock,
        logout,
        setConnectionConfig
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
