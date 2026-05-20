import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PACKAGES,
  GENDER_OPTIONS,
  STATUS_OPTIONS,
  buildMemberPayload,
  formatRs,
  memberMatchesQuery,
  packageOptionLabel,
  parseAmount,
  resolvePackageId,
  todayInputValue,
} from './memberShared';
import './EditMembers.css';

function emptyEditForm() {
  return {
    memberCode: '',
    status: 'active',
    fullName: '',
    phone: '',
    gender: '',
    registrationDate: todayInputValue(),
    address: '',
    notes: '',
    packageId: DEFAULT_PACKAGES[0]?.id ?? '',
    packageStartDate: todayInputValue(),
    discount: '0',
  };
}

function studentToForm(student) {
  const packageId = resolvePackageId(student);
  return {
    memberCode: student.memberCode ?? '',
    status: student.status ?? 'active',
    fullName: student.name ?? '',
    phone: student.phone ?? '',
    gender: student.gender ?? '',
    registrationDate: student.registrationDate ?? student.entryDate ?? todayInputValue(),
    address: student.address ?? '',
    notes: student.notes ?? '',
    packageId,
    packageStartDate: student.packageStartDate ?? student.entryDate ?? todayInputValue(),
    discount: String(student.discount ?? 0),
  };
}

export default function EditMembers() {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyEditForm);
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const api = window.gymApp?.students;
  const packages = DEFAULT_PACKAGES;

  const filtered = useMemo(() => {
    const sorted = [...members].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' })
    );
    return sorted.filter((m) => memberMatchesQuery(m, search));
  }, [members, search]);

  const selectedPackage =
    packages.find((p) => p.id === form.packageId) ?? packages[0];

  const totalAmount = useMemo(() => {
    const packagePrice = selectedPackage?.price ?? 0;
    const discount = parseAmount(form.discount);
    return Math.max(0, packagePrice - discount);
  }, [form.discount, selectedPackage]);

  const loadMembers = useCallback(async () => {
    if (!api?.list) {
      setLoading(false);
      setError('Local database is only available in the desktop app.');
      return;
    }
    try {
      setError('');
      const list = await api.list();
      setMembers(list);
      setSelectedId((current) => {
        if (current && list.some((m) => m.id === current)) return current;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err.message ?? 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!window.gymApp?.onSyncStatus) return undefined;
    return window.gymApp.onSyncStatus((status) => {
      if (status?.merged || status?.status === 'synced') {
        loadMembers();
      }
    });
  }, [loadMembers]);

  useEffect(() => {
    const member = members.find((m) => m.id === selectedId);
    if (!member) {
      setForm(emptyEditForm());
      setBaseline(null);
      return;
    }
    const next = studentToForm(member);
    setForm(next);
    setBaseline(next);
  }, [selectedId, members]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setSuccess('');
  }

  function handleSelect(memberId) {
    setSelectedId(memberId);
    setError('');
    setSuccess('');
  }

  function handleClear() {
    if (baseline) {
      setForm({ ...baseline });
    } else {
      setForm(emptyEditForm());
    }
    setError('');
    setSuccess('');
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!api?.update || !selectedId) return;

    const name = form.fullName.trim();
    if (!name) {
      setError('Full name is required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = buildMemberPayload(form, selectedPackage, { totalAmount });
      const updated = await api.update(selectedId, payload);
      setSuccess(`Saved changes for ${updated.name}.`);
      setBaseline(studentToForm(updated));
      await loadMembers();
    } catch (err) {
      setError(err.message ?? 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="edit-members">
      {error && (
        <p className="edit-members__message edit-members__message--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="edit-members__message edit-members__message--success" role="status">
          {success}
        </p>
      )}

      <div className="edit-members__layout">
        <aside className="edit-members__search card">
          <h2 className="edit-members__panel-title">Search Members</h2>
          <input
            type="search"
            className="edit-members__search-input"
            placeholder="Search by code (ID), name, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="edit-members__results" role="listbox" aria-label="Members">
            {loading && <li className="edit-members__empty">Loading…</li>}
            {!loading && filtered.length === 0 && (
              <li className="edit-members__empty">No members found.</li>
            )}
            {!loading &&
              filtered.map((member, index) => {
                const isActive = member.id === selectedId;
                const status = member.status ?? 'active';
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`edit-members__result${isActive ? ' is-selected' : ''}`}
                      onClick={() => handleSelect(member.id)}
                    >
                      <span className="edit-members__result-title">
                        #{index + 1} — {member.name}
                      </span>
                      <span className="edit-members__result-meta">
                        {member.phone || '—'} · {status}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </aside>

        <section className="edit-members__form card">
          {!selectedId ? (
            <p className="edit-members__empty">Select a member from the list to edit.</p>
          ) : (
            <form onSubmit={handleSave}>
              <h2 className="edit-members__panel-title">Edit Member</h2>

              <div className="edit-members__grid">
                <label>
                  Member Code (ID)
                  <input type="text" value={form.memberCode} readOnly aria-readonly />
                </label>
                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => updateField('status', e.target.value)}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Full Name
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => updateField('fullName', e.target.value)}
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                  />
                </label>
                <label>
                  Gender
                  <select
                    value={form.gender}
                    onChange={(e) => updateField('gender', e.target.value)}
                  >
                    {GENDER_OPTIONS.map((opt) => (
                      <option key={opt.value || 'none'} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Registration Date
                  <input
                    type="date"
                    value={form.registrationDate}
                    onChange={(e) => updateField('registrationDate', e.target.value)}
                  />
                </label>
                <label className="edit-members__full">
                  Address
                  <textarea
                    rows={3}
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                  />
                </label>
                <label className="edit-members__full">
                  Notes
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                  />
                </label>
              </div>

              <h3 className="edit-members__subheading">Package</h3>
              <div className="edit-members__grid">
                <label>
                  Select Package
                  <select
                    value={form.packageId}
                    onChange={(e) => updateField('packageId', e.target.value)}
                  >
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {packageOptionLabel(pkg)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start Date
                  <input
                    type="date"
                    value={form.packageStartDate}
                    onChange={(e) => updateField('packageStartDate', e.target.value)}
                  />
                </label>
                <label>
                  Discount (Rs)
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.discount}
                    onChange={(e) => updateField('discount', e.target.value)}
                  />
                </label>
              </div>

              <footer className="edit-members__footer">
                <div className="edit-members__total-box">
                  <span className="edit-members__total-label">Total Amount</span>
                  <strong className="edit-members__total-value">{formatRs(totalAmount)}</strong>
                </div>
                <div className="edit-members__actions">
                  <button
                    type="button"
                    className="edit-members__btn-clear"
                    onClick={handleClear}
                    disabled={saving}
                  >
                    Clear
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </footer>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
