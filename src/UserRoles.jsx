import { useCallback, useEffect, useState } from 'react';
import { APP_PERMISSIONS, formatPermissionLabels } from './permissionsShared';
import './ModulePage.css';
import './UserRoles.css';

function emptyUserForm() {
  return {
    username: '',
    password: '',
    role: 'staff',
    permissions: [],
  };
}

export default function UserRoles({ session }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyUserForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const usersApi = window.gymApp?.auth;
  const isAdmin = session?.role === 'admin';

  const load = useCallback(async () => {
    if (!usersApi?.listUsers || !isAdmin) {
      setLoading(false);
      return;
    }
    try {
      const list = await usersApi.listUsers();
      setUsers(list);
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, usersApi]);

  useEffect(() => {
    load();
  }, [load]);

  function togglePermission(id) {
    setForm((prev) => {
      const has = prev.permissions.includes(id);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter((p) => p !== id)
          : [...prev.permissions, id],
      };
    });
  }

  async function handleAddUser(event) {
    event.preventDefault();
    if (!usersApi?.createUser) return;

    setSaving(true);
    setMessage('');
    try {
      await usersApi.createUser({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        permissions: form.role === 'admin' ? [] : form.permissions,
      });
      setForm(emptyUserForm());
      await load();
      setMessageType('success');
      setMessage('User added.');
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to add user');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user) {
    if (!usersApi?.deleteUser) return;
    const confirmed = window.confirm(`Delete user "${user.username}"?`);
    if (!confirmed) return;

    setSaving(true);
    setMessage('');
    try {
      await usersApi.deleteUser(user.id);
      await load();
      setMessageType('success');
      setMessage('User removed.');
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to delete user');
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <section className="user-roles module-page card module-card">
        <h2 className="module-card__title">User Roles &amp; Permissions</h2>
        <p className="module-page__message module-page__message--error">
          Only administrators can manage users.
        </p>
      </section>
    );
  }

  return (
    <section className="user-roles module-page">
      <form className="user-roles__form card module-card" onSubmit={handleAddUser}>
        <h2 className="module-card__title">User Roles &amp; Permissions</h2>

        {message && (
          <p
            className={`module-page__message module-page__message--${messageType === 'success' ? 'success' : 'error'}`}
            role="alert"
          >
            {message}
          </p>
        )}

        <div className="user-roles__row">
          <input
            className="module-input"
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            disabled={saving}
            required
          />
          <input
            className="module-input"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            disabled={saving}
            required
          />
          <select
            className="module-input"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            disabled={saving}
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {form.role === 'staff' && (
          <div className="user-roles__permissions">
            <h3 className="user-roles__permissions-title">Select Permissions</h3>
            <ul className="user-roles__permission-list">
              {APP_PERMISSIONS.map((perm) => (
                <li key={perm.id}>
                  <label className="user-roles__check">
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(perm.id)}
                      onChange={() => togglePermission(perm.id)}
                      disabled={saving}
                    />
                    {perm.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button type="submit" className="btn-primary user-roles__add" disabled={saving || loading}>
          {saving ? 'Saving…' : 'Add User'}
        </button>
      </form>

      <div className="user-roles__table-wrap card module-card">
        <table className="user-roles__table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Permissions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="user-roles__empty">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={4} className="user-roles__empty">
                  No users yet.
                </td>
              </tr>
            )}
            {!loading &&
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.role}</td>
                  <td>
                    {user.role === 'admin'
                      ? 'All'
                      : formatPermissionLabels(user.permissions)}
                  </td>
                  <td>
                    {user.id !== session?.id && user.username !== 'admin' ? (
                      <button
                        type="button"
                        className="btn-secondary btn-secondary--compact"
                        onClick={() => handleDelete(user)}
                        disabled={saving}
                      >
                        Delete
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
