import { useEffect, useState } from 'react';
import icon from '../assets/dumble.png';
import StudentsDashboard from './StudentsDashboard';
import './App.css';

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

export default function App() {
  const [appVersion, setAppVersion] = useState('');
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    window.gymApp?.getVersion?.().then((version) => {
      if (version) setAppVersion(version);
    });
  }, []);

  useEffect(() => {
    if (!window.gymApp?.onUpdateStatus) return undefined;
    return window.gymApp.onUpdateStatus(setUpdate);
  }, []);

  function installUpdate() {
    window.gymApp?.installUpdate?.();
  }

  return (
    <div className="app">
      <UpdateBanner update={update} onInstall={installUpdate} />

      <header className="header">
        <img src={icon} alt="Gym" className="logo" />
        <div className="header-text">
          <h1>Gym</h1>
          <p className="subtitle">Students, attendance &amp; fingerprint check-in</p>
        </div>
        <span className="header-badge">Dashboard</span>
      </header>

      <StudentsDashboard />

      <footer className="footer">
        {appVersion ? `Gym v${appVersion}` : 'Gym'} · {window.gymApp?.platform ?? 'desktop'}
      </footer>
    </div>
  );
}
