import { useCallback, useEffect, useMemo, useState } from 'react';
import './AddPackages.css';
import './ModulePage.css';

function emptyForm() {
  return { fullName: '', phone: '', email: '', monthlySalary: '', active: 'yes' };
}

function trainerToForm(t) {
  return {
    fullName: t.fullName ?? '',
    phone: t.phone ?? '',
    email: t.email ?? '',
    monthlySalary: String(t.monthlySalary ?? 0),
    active: t.active !== false ? 'yes' : 'no',
  };
}

function trainerMatchesQuery(t, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    t.fullName.toLowerCase().includes(q) ||
    (t.phone ?? '').toLowerCase().includes(q) ||
    (t.email ?? '').toLowerCase().includes(q)
  );
}

export default function AddTrainers() {
  const [trainers, setTrainers] = useState([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const api = window.gymApp?.trainers;
  const editing = selectedId != null;

  const load = useCallback(async () => {
    if (!api?.list) {
      setLoading(false);
      setMessageType('error');
      setMessage('Local database is only available in the desktop app.');
      return;
    }
    try {
      setMessage('');
      setTrainers(await api.list({ includeInactive: true }));
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to load trainers');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = trainers.find((x) => x.id === selectedId);
    setForm(t ? trainerToForm(t) : emptyForm());
  }, [selectedId, trainers]);

  const visible = useMemo(
    () =>
      trainers.filter((t) => {
        if (!showInactive && t.active === false) return false;
        return trainerMatchesQuery(t, search);
      }),
    [trainers, search, showInactive]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.fullName.trim()) {
      setMessageType('error');
      setMessage('Full name is required.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        monthlySalary: Number(form.monthlySalary) || 0,
        active: form.active === 'yes',
      };
      if (editing) {
        await api.update(selectedId, payload);
        setMessageType('success');
        setMessage(`Updated ${payload.fullName}.`);
      } else {
        const created = await api.create(payload);
        setSelectedId(created.id);
        setMessageType('success');
        setMessage(`Created ${created.fullName}.`);
      }
      await load();
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-packages module-page">
      {message && (
        <p className={`module-page__message module-page__message--${messageType}`}>{message}</p>
      )}
      <div className="add-packages__layout">
        <aside className="add-packages__list card">
          <h2 className="add-packages__panel-title">Search Trainers</h2>
          <input
            type="search"
            className="add-packages__search-input"
            placeholder="Name/Phone/Email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="add-packages__checkbox">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          <ul className="add-packages__cards">
            {loading && <li className="add-packages__empty">Loading…</li>}
            {!loading && visible.length === 0 && <li className="add-packages__empty">No trainers.</li>}
            {!loading &&
              visible.map((t) => (
                <li key={t.id}>
                  <article className={`add-packages__card${selectedId === t.id ? ' is-selected' : ''}`}>
                    <button type="button" className="add-packages__card-main" onClick={() => setSelectedId(t.id)}>
                      <strong>{t.fullName}</strong>
                      <span>
                        {t.phone || '—'} · Rs {t.monthlySalary?.toLocaleString('en-PK') ?? 0}
                      </span>
                    </button>
                  </article>
                </li>
              ))}
          </ul>
        </aside>
        <section className="add-packages__form card">
          <form onSubmit={handleSubmit}>
            <h2 className="add-packages__panel-title">{editing ? 'Edit Trainer' : 'Add Trainer'}</h2>
            <div className="add-packages__grid">
              <label className="add-packages__full">
                Full Name
                <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
              </label>
              <label>
                Phone
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label>
                Email
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label>
                Monthly Salary (Rs)
                <input type="number" min={0} value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} />
              </label>
              <label>
                Active
                <select value={form.active} onChange={(e) => setForm({ ...form, active: e.target.value })}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
            <footer className="add-packages__footer">
              <button type="button" className="add-packages__btn-clear" onClick={() => { setSelectedId(null); setForm(emptyForm()); }} disabled={saving}>
                Clear
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </div>
  );
}
