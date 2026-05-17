import { useEffect, useState } from 'react';
import icon from '../assets/icon.png';
import './App.css';

const INITIAL_WORKOUTS = [
  { id: 1, name: 'Bench press', sets: '3 × 10' },
  { id: 2, name: 'Squats', sets: '4 × 8' },
  { id: 3, name: 'Deadlift', sets: '3 × 5' },
];

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
  const [workouts, setWorkouts] = useState(INITIAL_WORKOUTS);
  const [name, setName] = useState('');
  const [sets, setSets] = useState('');
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

  function addWorkout(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setWorkouts((current) => [
      ...current,
      {
        id: Date.now(),
        name: trimmedName,
        sets: sets.trim() || '—',
      },
    ]);
    setName('');
    setSets('');
  }

  function removeWorkout(id) {
    setWorkouts((current) => current.filter((item) => item.id !== id));
  }

  function installUpdate() {
    window.gymApp?.installUpdate?.();
  }

  return (
    <div className="app">
      <UpdateBanner update={update} onInstall={installUpdate} />

      <header className="header">
        <img src={icon} alt="Gym" className="logo" />
        <div>
          <h1>Gym</h1>
          <p className="subtitle">Track today&apos;s workout</p>
        </div>
      </header>

      <main className="main">
        <section className="card">
          <h2>Add exercise</h2>
          <form className="form" onSubmit={addWorkout}>
            <label>
              Exercise
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lat pulldown"
              />
            </label>
            <label>
              Sets / reps
              <input
                type="text"
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                placeholder="e.g. 3 × 12"
              />
            </label>
            <button type="submit">Add to list</button>
          </form>
        </section>

        <section className="card">
          <h2>Today&apos;s plan</h2>
          {workouts.length === 0 ? (
            <p className="empty">No exercises yet. Add your first one above.</p>
          ) : (
            <ul className="list">
              {workouts.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.sets}</span>
                  </div>
                  <button
                    type="button"
                    className="remove"
                    onClick={() => removeWorkout(item.id)}
                    aria-label={`Remove ${item.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="footer">
        {appVersion ? `Gym v${appVersion}` : 'Gym'} · {window.gymApp?.platform ?? 'desktop'}
      </footer>
    </div>
  );
}
