import { useMemo, useState } from 'react';
import {
  formatPackagePrice,
  packageMatchesQuery,
} from './memberShared';
import { usePackages } from './usePackages';
import './AddPackages.css';

function emptyForm() {
  return {
    name: '',
    days: '',
    price: '',
    active: 'yes',
  };
}

function packageToForm(pkg) {
  return {
    name: pkg.label ?? '',
    days: String(pkg.days ?? ''),
    price: String(pkg.price ?? ''),
    active: pkg.active !== false ? 'yes' : 'no',
  };
}

export default function AddPackages() {
  const { packages, loading, error, reload } = usePackages({ includeInactive: true });
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const api = window.gymApp?.packages;
  const editing = selectedId != null;

  const visible = useMemo(() => {
    return packages.filter((pkg) => {
      if (!showInactive && pkg.active === false) return false;
      return packageMatchesQuery(pkg, search);
    });
  }, [packages, search, showInactive]);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setMessage('');
  }

  function handleSelect(pkg) {
    setSelectedId(pkg.id);
    setForm(packageToForm(pkg));
    setMessage('');
  }

  function handleClear() {
    setSelectedId(null);
    setForm(emptyForm());
    setMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!api?.create && !api?.update) {
      setMessageType('error');
      setMessage('Local database is only available in the desktop app.');
      return;
    }

    const name = form.name.trim();
    if (!name) {
      setMessageType('error');
      setMessage('Package name is required.');
      return;
    }

    const days = Number(form.days);
    const price = Number(form.price);
    if (!Number.isFinite(days) || days < 1) {
      setMessageType('error');
      setMessage('Enter a valid duration in days.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setMessageType('error');
      setMessage('Enter a valid price.');
      return;
    }

    const payload = {
      label: name,
      days,
      price,
      active: form.active === 'yes',
    };

    setSaving(true);
    setMessage('');
    try {
      if (editing) {
        await api.update(selectedId, payload);
        setMessageType('success');
        setMessage(`Updated package “${name}”.`);
      } else {
        const created = await api.create(payload);
        setMessageType('success');
        setMessage(`Created package “${created.label}”.`);
        setSelectedId(created.id);
      }
      await reload();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to save package');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(pkg) {
    if (!api?.update) return;
    const nextActive = pkg.active === false;
    setSaving(true);
    setMessage('');
    try {
      await api.update(pkg.id, { active: nextActive });
      setMessageType('success');
      setMessage(nextActive ? `Activated “${pkg.label}”.` : `Deactivated “${pkg.label}”.`);
      if (selectedId === pkg.id) {
        setForm((f) => ({ ...f, active: nextActive ? 'yes' : 'no' }));
      }
      await reload();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to update package');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pkg) {
    if (!api?.delete) return;
    const ok = window.confirm(`Delete package “${pkg.label}”? This cannot be undone.`);
    if (!ok) return;

    setSaving(true);
    setMessage('');
    try {
      await api.delete(pkg.id);
      if (selectedId === pkg.id) {
        handleClear();
      }
      setMessageType('success');
      setMessage(`Deleted package “${pkg.label}”.`);
      await reload();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to delete package');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-packages">
      {(error || message) && (
        <p
          className={`add-packages__message add-packages__message--${messageType || (error ? 'error' : 'success')}`}
          role={messageType === 'error' || error ? 'alert' : 'status'}
        >
          {message || error}
        </p>
      )}

      <div className="add-packages__layout">
        <aside className="add-packages__list card">
          <h2 className="add-packages__panel-title">Search Packages</h2>
          <input
            type="search"
            className="add-packages__search-input"
            placeholder="Search by name or days"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="add-packages__checkbox">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>

          <ul className="add-packages__cards">
            {loading && <li className="add-packages__empty">Loading…</li>}
            {!loading && visible.length === 0 && (
              <li className="add-packages__empty">No packages found.</li>
            )}
            {!loading &&
              visible.map((pkg) => {
                const isSelected = pkg.id === selectedId;
                return (
                  <li key={pkg.id}>
                    <article
                      className={`add-packages__card${isSelected ? ' is-selected' : ''}${pkg.active === false ? ' is-inactive' : ''}`}
                    >
                      <button
                        type="button"
                        className="add-packages__card-main"
                        onClick={() => handleSelect(pkg)}
                      >
                        <strong>{pkg.label}</strong>
                        <span>
                          {pkg.days} days · {formatPackagePrice(pkg.price)}
                        </span>
                        {pkg.active === false && (
                          <span className="add-packages__inactive-tag">Inactive</span>
                        )}
                      </button>
                      <div className="add-packages__card-actions">
                        <button
                          type="button"
                          className="add-packages__btn-text"
                          onClick={() => handleSelect(pkg)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="add-packages__btn-text"
                          onClick={() => handleToggleActive(pkg)}
                          disabled={saving}
                        >
                          {pkg.active === false ? 'Activate' : 'Deactivate'}
                        </button>
                        <button
                          type="button"
                          className="add-packages__btn-delete"
                          onClick={() => handleDelete(pkg)}
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  </li>
                );
              })}
          </ul>
        </aside>

        <section className="add-packages__form card">
          <form onSubmit={handleSubmit}>
            <h2 className="add-packages__panel-title">
              {editing ? 'Edit Package' : 'Create Package'}
            </h2>

            <div className="add-packages__grid">
              <label className="add-packages__full">
                Name
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  required
                />
              </label>
              <label>
                Duration (days)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.days}
                  onChange={(e) => setField('days', e.target.value)}
                  required
                />
              </label>
              <label>
                Price
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.price}
                  onChange={(e) => setField('price', e.target.value)}
                  required
                />
              </label>
              <label>
                Active
                <select
                  value={form.active}
                  onChange={(e) => setField('active', e.target.value)}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>

            <p className="add-packages__note">
              Note: Member assignment ke waqt start date + duration se end date auto-calc hoti hai.
              Agar aap package deactivate karte ho to new assignments me hide ho jayega; existing
              members par as-is rahega.
            </p>

            <footer className="add-packages__footer">
              <div className="add-packages__actions">
                <button
                  type="button"
                  className="add-packages__btn-clear"
                  onClick={handleClear}
                  disabled={saving}
                >
                  Clear
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </footer>
          </form>
        </section>
      </div>
    </div>
  );
}
