import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { StatusBanner } from '../components/StatusBanner';
import { getStoredAppearance, saveAppearance, type AppearanceMode } from '../lib/appearance';
import { useSession } from '../state/session';

export function SetupPage(): JSX.Element {
  const navigate = useNavigate();
  const { session, connectWithPassword, connectMock, logout } = useSession();
  const [baseUrl, setBaseUrl] = useState(session.connection?.baseUrl || import.meta.env.VITE_HB_DEFAULT_BASE_URL || '');
  const [username, setUsername] = useState(session.username || '');
  const [password, setPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState(session.rememberLogin === true);
  const [authMethod, setAuthMethod] = useState<'password' | 'mock'>(session.connection?.authMethod || 'password');
  const [appearance, setAppearance] = useState<AppearanceMode>(getStoredAppearance());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string }>();

  async function testAndConnect(): Promise<void> {
    setBusy(true);
    setMessage(undefined);

    try {
      if (authMethod === 'mock') {
        await connectMock({ baseUrl });
        setMessage({ tone: 'success', text: 'Connected in mock mode.' });
        navigate('/scan');
        return;
      }

      if (!baseUrl.trim()) throw new Error('Base URL is required.');
      if (!username.trim()) throw new Error('Username is required.');
      if (!password.trim()) throw new Error('Password is required.');

      await connectWithPassword(
        {
          baseUrl: baseUrl.trim(),
          authMethod: 'password'
        },
        {
          username: username.trim(),
          password,
          stayLoggedIn: rememberLogin
        },
        rememberLogin
      );

      setMessage({ tone: 'success', text: 'Connected to HomeBox.' });
      navigate('/scan');
    } catch (caught) {
      let text = caught instanceof Error ? caught.message : 'Unable to connect';
      if (/NetworkError|Failed to fetch|Load failed/i.test(text)) {
        text = 'Browser network block. Most likely CORS or certificate trust. In dev, enable the Vite proxy in .env and restart npm run dev.';
      }
      setMessage({
        tone: 'error',
        text
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout
      title="Connection Setup"
      rightAction={
        session.connected ? (
          <button type="button" className="secondary-button" onClick={logout}>
            Disconnect
          </button>
        ) : undefined
      }
    >
      {message ? <StatusBanner tone={message.tone} message={message.text} /> : null}

      <div className="card form-card">
        <label className="field-label">Site Appearance</label>
        <select
          className="text-input"
          value={appearance}
          onChange={(event) => {
            const next = event.target.value as AppearanceMode;
            setAppearance(next);
            saveAppearance(next);
          }}
        >
          <option value="amoled">AMOLED Dark</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
        <div className="helper-text">Default is AMOLED dark mode. This preference is saved on this device.</div>

        <label className="field-label">HomeBox Base URL</label>
        <input
          className="text-input"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://homebox.example.com"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <div className="helper-text">The app automatically talks to the HomeBox API under /api/v1/*.</div>

        <label className="field-label">Authentication Method</label>
        <select className="text-input" value={authMethod} onChange={(event) => setAuthMethod(event.target.value as 'password' | 'mock')}>
          <option value="password">Username / Password</option>
          <option value="mock">Mock Mode</option>
        </select>

        {authMethod === 'password' ? (
          <>
            <label className="field-label">Username</label>
            <input className="text-input" value={username} onChange={(event) => setUsername(event.target.value)} />

            <label className="field-label">Password</label>
            <input className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />

            <label className="checkbox-row">
              <input type="checkbox" checked={rememberLogin} onChange={(event) => setRememberLogin(event.target.checked)} />
              <span>Remember this device</span>
            </label>
            <div className="helper-text">Leave unchecked on shared devices. Unchecked stores the token only for this browser session.</div>
          </>
        ) : (
          <div className="helper-text">
            Mock mode uses local in-browser sample data so the scanner flows can be developed without a live HomeBox API.
          </div>
        )}

        <div className="action-row">
          <button type="button" className="primary-button" onClick={() => void testAndConnect()} disabled={busy}>
            {busy ? 'Connecting…' : 'Test Connection'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Live instance inspection checklist</div>
        <ol className="plain-list">
          <li>Try /swagger/index.html first, then /api/swagger/ if the first path is missing.</li>
          <li>Try GET /api/v1/status and POST /api/v1/users/login.</li>
          <li>Inspect GET /api/v1/items, GET /api/v1/locations, and GET /api/v1/tags.</li>
          <li>Render one native item label and one native location label, then scan them and record the raw payloads.</li>
        </ol>
      </div>
    </Layout>
  );
}
