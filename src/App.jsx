import { useEffect, useState } from 'react';
import icon from '../assets/dumble.png';
import StudentsDashboard from './StudentsDashboard';
import SignIn from './SignIn';
import SignUp from './SignUp';
import './App.css';

function SyncBanner({ sync, onSyncNow }) {
  if (!sync?.configured) {
    return null;
  }

  if (sync.status === 'idle' || (sync.status === 'synced' && !sync.merged)) {
    return null;
  }

  const label =
    sync.status === 'syncing'
      ? sync.message || 'Syncing with cloud…'
      : sync.status === 'offline'
        ? sync.message || 'Offline — using local database'
        : sync.status === 'error'
          ? sync.message || 'Cloud sync failed'
          : sync.status === 'synced' && sync.merged
            ? sync.message || 'Cloud sync updated local data'
            : sync.message || 'Cloud sync';

  const modifier =
    sync.status === 'error'
      ? 'sync-banner--error'
      : sync.status === 'offline'
        ? 'sync-banner--offline'
        : '';

  return (
    <div className={`sync-banner ${modifier}`.trim()} role="status">
      <p>{label}</p>
      {onSyncNow && sync.status !== 'syncing' && (
        <button type="button" className="sync-now" onClick={onSyncNow}>
          Retry sync
        </button>
      )}
    </div>
  );
}

function UpdateBanner({ update, onInstall }) {
  if (!update || update.status === 'not-available' || update.status === 'checking') {
    return null;
  }

  if (update.status === 'error') {
    return (
      <div className="update-banner update-banner--error" role="status">
        <p>Could not check for updates. {update.message}</p>
      </div>
    );
  }

  if (update.status === 'available' || update.status === 'downloading') {
    const percent =
      update.status === 'downloading' && update.percent != null
        ? Math.round(update.percent)
        : null;

    return (
      <div className="update-banner" role="status">
        <p>
          {percent != null
            ? `Downloading Gym ${update.version}… ${percent}%`
            : `Gym ${update.version} is available. Downloading in the background…`}
        </p>
        {percent != null && (
          <div className="update-progress">
            <div className="update-progress__bar" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    );
  }

  if (update.status === 'downloaded') {
    return (
      <div className="update-banner update-banner--ready" role="status">
        <p>Gym {update.version} is ready to install.</p>
        <button type="button" className="update-install" onClick={onInstall}>
          Restart and update
        </button>
      </div>
    );
  }

  return null;
}

function AuthNotice({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div className="auth-notice" role="status">
      <p>{message}</p>
      <button type="button" className="auth-notice__dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function MainApp({ session, onLogout, authNotice, onDismissAuthNotice }) {
  const [appVersion, setAppVersion] = useState('');
  const [update, setUpdate] = useState(null);
  const [sync, setSync] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    window.gymApp?.getVersion?.().then((version) => {
      if (version) setAppVersion(version);
    });
    window.gymApp?.getSyncStatus?.().then((status) => {
      if (status) setSync(status);
    });
  }, []);

  useEffect(() => {
    if (!window.gymApp?.onUpdateStatus) return undefined;
    return window.gymApp.onUpdateStatus(setUpdate);
  }, []);

  useEffect(() => {
    if (!window.gymApp?.onSyncStatus) return undefined;
    return window.gymApp.onSyncStatus((status) => {
      setSync(status);
      setSyncing(status?.status === 'syncing');
    });
  }, []);

  function installUpdate() {
    window.gymApp?.installUpdate?.();
  }

  function checkForUpdates() {
    setUpdate({ status: 'checking' });
    window.gymApp?.checkForUpdates?.();
  }

  async function runSyncNow() {
    if (!window.gymApp?.runSync) return;
    setSyncing(true);
    await window.gymApp.runSync();
    setSyncing(false);
  }

  const syncConfigured = sync?.configured;
  const offline = sync?.status === 'offline' || sync?.online === false;
  const syncLabel = !syncConfigured
    ? 'Cloud not configured'
    : syncing
      ? 'Syncing…'
      : offline
        ? 'Offline (local DB)'
        : 'Sync with cloud';

  return (
    <div className="app">
      <AuthNotice message={authNotice} onDismiss={onDismissAuthNotice} />
      <SyncBanner sync={sync} onSyncNow={window.gymApp?.runSync ? runSyncNow : null} />
      <UpdateBanner update={update} onInstall={installUpdate} />

      <header className="header">
        <div className="logo-wrap">
          <img src={icon} alt="Gym" className="logo" />
        </div>
        <div className="header-text">
          <h1>Gym</h1>
          <p className="subtitle">Students, attendance &amp; member ID / PIN check-in</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={`header-sync ${offline && syncConfigured ? 'header-sync--offline' : ''}`}
            onClick={runSyncNow}
            disabled={syncing || !syncConfigured}
            title={
              !syncConfigured
                ? 'Add gym-sync-config.json in AppData to enable cloud sync'
                : offline
                  ? 'No internet — data stays on this PC'
                  : 'Push and pull students & users from MongoDB'
            }
          >
            {syncLabel}
          </button>
          <span className="header-user">{session.username}</span>
          <button type="button" className="header-signout" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <StudentsDashboard />

      <footer className="footer">
        {appVersion ? `Gym v${appVersion}` : 'Gym'} · {window.gymApp?.platform ?? 'desktop'}
        {offline && ' · Offline mode'}
        {window.gymApp?.checkForUpdates && (
          <>
            {' · '}
            <button type="button" className="footer-link" onClick={checkForUpdates}>
              Check for updates
            </button>
          </>
        )}
      </footer>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authView, setAuthView] = useState('signin');
  const [authNotice, setAuthNotice] = useState('');

  function handleSignedIn(nextSession, cloudSync) {
    setSession(nextSession);
    if (cloudSync?.status === 'synced') {
      setAuthNotice(cloudSync.message || 'Account saved to MongoDB.');
    } else if (cloudSync && cloudSync.status !== 'existing') {
      setAuthNotice(cloudSync.message || '');
    } else {
      setAuthNotice('');
    }
  }

  useEffect(() => {
    window.gymApp?.auth
      ?.getSession?.()
      .then((current) => setSession(current))
      .finally(() => setAuthLoading(false));
  }, []);

  async function handleLogout() {
    await window.gymApp?.auth?.logout?.();
    setSession(null);
    setAuthNotice('');
    setAuthView('signin');
  }

  if (authLoading) {
    return <div className="app-loading">Loading…</div>;
  }

  if (!session) {
    if (authView === 'signup') {
      return (
        <SignUp onSignedIn={handleSignedIn} onShowSignIn={() => setAuthView('signin')} />
      );
    }
    return (
      <SignIn onSignedIn={handleSignedIn} onShowSignUp={() => setAuthView('signup')} />
    );
  }

  return (
    <MainApp
      session={session}
      onLogout={handleLogout}
      authNotice={authNotice}
      onDismissAuthNotice={() => setAuthNotice('')}
    />
  );
}
