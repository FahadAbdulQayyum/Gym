import { useRef, useState } from 'react';
import icon from '../assets/dumble.png';
import './SignIn.css';

export default function SignUp({ onSignedIn, onShowSignIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Create account');
  const submittingRef = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    if (!window.gymApp?.auth?.signup) {
      setError('Sign-up is only available in the desktop app.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setLoadingLabel('Creating account…');
    setError('');

    try {
      setLoadingLabel('Saving to MongoDB…');
      const result = await window.gymApp.auth.signup(username, password);
      const session = result?.session ?? result;
      onSignedIn(session, result?.cloudSync);
    } catch (err) {
      const message = err.message ?? 'Could not create account';
      if (/already registered/i.test(message)) {
        setError(`${message} Use "Sign in" below if this is your account.`);
      } else {
        setError(message);
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
      setLoadingLabel('Create account');
    }
  }

  return (
    <div className="signin-page">
      <div className="signin-card">
        <div className="signin-logo-wrap">
          <img src={icon} alt="Gym" className="signin-logo" />
        </div>
        <h1 className="signin-title">Create account</h1>
        <p className="signin-subtitle">Register once — use the same login on any computer</p>

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
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_]+"
              title="Letters, numbers, and underscores only"
            />
          </label>

          <label className="signin-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              disabled={loading}
              required
              minLength={4}
            />
          </label>

          <label className="signin-field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              disabled={loading}
              required
              minLength={4}
            />
          </label>

          {error && (
            <p className="signin-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="signin-submit" disabled={loading}>
            {loading ? loadingLabel : 'Create account'}
          </button>
        </form>

        <p className="signin-switch">
          Already have an account?{' '}
          <button type="button" className="signin-link" onClick={onShowSignIn} disabled={loading}>
            Sign in
          </button>
        </p>
        <p className="signin-offline-note">
          Your account is saved to the cloud when online. Student data syncs after you sign in.
        </p>
      </div>
    </div>
  );
}
