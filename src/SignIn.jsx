import { useState } from 'react';
import icon from '../assets/dumble.png';
import './SignIn.css';

export default function SignIn({ onSignedIn, onShowSignUp }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!window.gymApp?.auth?.login) {
      setError('Sign-in is only available in the desktop app.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const session = await window.gymApp.auth.login(username, password);
      onSignedIn(session);
    } catch (err) {
      setError(err.message ?? 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="signin-page">
      <div className="signin-card">
        <div className="signin-logo-wrap">
          <img src={icon} alt="Gym" className="signin-logo" />
        </div>
        <h1 className="signin-title">Gym</h1>
        <p className="signin-subtitle">Sign in to manage students and attendance</p>

        <form className="signin-form" onSubmit={handleSubmit}>
          <label className="signin-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              disabled={loading}
              required
            />
          </label>

          <label className="signin-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </label>

          {error && (
            <p className="signin-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="signin-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="signin-switch">
          Need an account?{' '}
          <button type="button" className="signin-link" onClick={onShowSignUp} disabled={loading}>
            Create one
          </button>
        </p>
        <p className="signin-hint">Default on this device only: admin / admin</p>
        <p className="signin-offline-note">
          Accounts created with &quot;Create one&quot; are stored in the cloud — sign in on any PC with the same
          username and password.
        </p>
      </div>
    </div>
  );
}
