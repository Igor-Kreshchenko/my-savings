import { useEffect, useState, type FormEvent } from 'react';
import { getApiToken, hasSavedApiToken, saveApiToken } from './api/settings.js';
import { Dashboard } from './features/dashboard/Dashboard.js';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem('my-savings.theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [token, setToken] = useState('');
  const [savedTokenOverride, setSavedTokenOverride] =
    useState(hasSavedApiToken);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('my-savings.theme', theme);
  }, [theme]);

  function updateTheme(nextTheme: Theme): void {
    setTheme(nextTheme);
  }

  function handleSaveToken(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (token.trim().length === 0) {
      setNotice('Enter a token, or choose the build-time token below.');
      return;
    }

    saveApiToken(token);
    setSavedTokenOverride(true);
    setToken('');
    setNotice('API token saved in this browser.');
  }

  function useBuildTimeToken(): void {
    saveApiToken('');
    setSavedTokenOverride(false);
    setToken('');
    setNotice(
      import.meta.env.VITE_API_TOKEN
        ? 'Using the build-time API token.'
        : 'Saved token cleared. Configure VITE_API_TOKEN to provide a default.',
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="My Savings home">
          <span className="brand-mark" aria-hidden="true">
            $
          </span>
          <span className="brand-name">My Savings</span>
        </a>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => updateTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☼' : '☾'}
          </button>
          <button
            className="settings-button"
            type="button"
            onClick={() => {
              setSettingsOpen((open) => !open);
              setNotice('');
            }}
            aria-expanded={settingsOpen}
          >
            Settings
          </button>
        </div>
      </header>

      <main className="main-content">
        {settingsOpen ? (
          <section className="settings-card" aria-labelledby="settings-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Connection</p>
                <h1 id="settings-heading">API settings</h1>
              </div>
              <button
                className="text-button"
                type="button"
                onClick={() => setSettingsOpen(false)}
              >
                Done
              </button>
            </div>
            <p className="settings-description">
              Add the API bearer token for this browser. A token provided with
              <code> VITE_API_TOKEN </code>
              is used by default unless you save an override here.
            </p>
            <form className="token-form" onSubmit={handleSaveToken}>
              <label htmlFor="api-token">Bearer token</label>
              <input
                id="api-token"
                autoComplete="off"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={
                  savedTokenOverride
                    ? 'A browser token is saved'
                    : getApiToken()
                      ? 'Build-time token is configured'
                      : 'Enter your API token'
                }
              />
              <div className="form-actions">
                <button className="primary-button" type="submit">
                  Save token
                </button>
                {savedTokenOverride && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={useBuildTimeToken}
                  >
                    Clear saved token
                  </button>
                )}
              </div>
            </form>
            <p className="settings-footnote">
              Browser-stored tokens are kept in localStorage. Use this only on a
              trusted device.
            </p>
            {notice && (
              <p className="form-notice" role="status">
                {notice}
              </p>
            )}
          </section>
        ) : (
          <>
            <Dashboard onOpenSettings={() => setSettingsOpen(true)} />
          </>
        )}
      </main>
    </div>
  );
}
