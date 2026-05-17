import { useState } from 'react';
import icon from '../assets/icon.png';
import './App.css';

const INITIAL_WORKOUTS = [
  { id: 1, name: 'Bench press', sets: '3 × 10' },
  { id: 2, name: 'Squats', sets: '4 × 8' },
  { id: 3, name: 'Deadlift', sets: '3 × 5' },
];

export default function App() {
  const [workouts, setWorkouts] = useState(INITIAL_WORKOUTS);
  const [name, setName] = useState('');
  const [sets, setSets] = useState('');

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

  return (
    <div className="app">
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
        Running on {window.gymApp?.platform ?? 'desktop'}
      </footer>
    </div>
  );
}
