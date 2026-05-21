import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PACKAGES,
  PAYMENT_METHODS,
  buildCollectFeePayload,
  formatRs,
  memberDisplayLabel,
  memberMatchesQuery,
  memberPackageLabel,
  parseAmount,
  resolveMemberPaymentMethod,
  resolvePackageId,
  todayInputValue,
} from './memberShared';
import { usePackages } from './usePackages';
import './CollectFees.css';

function emptyFeeForm() {
  return {
    packageId: '',
    discount: '0',
    paymentMethod: 'Cash',
    startFrom: '',
  };
}

function memberToFeeForm(member, packages) {
  const packageId = resolvePackageId(member, packages);
  return {
    packageId,
    discount: String(member.discount ?? 0),
    paymentMethod: resolveMemberPaymentMethod(member),
    startFrom: member.packageStartDate ?? member.entryDate ?? todayInputValue(),
  };
}

export default function CollectFees() {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyFeeForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const api = window.gymApp?.students;
  const feesApi = window.gymApp?.fees;
  const { packages: allPackages } = usePackages();
  const packages = allPackages.length ? allPackages : DEFAULT_PACKAGES;

  const selectedMember = members.find((m) => m.id === selectedId) ?? null;

  const selectedPackage = useMemo(() => {
    if (!selectedMember) return null;
    const id = form.packageId || resolvePackageId(selectedMember, packages);
    return packages.find((p) => p.id === id) ?? packages[0] ?? null;
  }, [form.packageId, packages, selectedMember]);

  const packagePrice = selectedPackage?.price ?? selectedMember?.packagePrice ?? 0;

  const totalAmount = useMemo(() => {
    const discount = parseAmount(form.discount);
    return Math.max(0, packagePrice - discount);
  }, [form.discount, packagePrice]);

  const filtered = useMemo(() => {
    const sorted = [...members].sort((a, b) => {
      const codeA = String(a.memberCode ?? '');
      const codeB = String(b.memberCode ?? '');
      const numA = Number(codeA);
      const numB = Number(codeB);
      if (!Number.isNaN(numA) && !Number.isNaN(numB) && codeA !== '' && codeB !== '') {
        return numA - numB;
      }
      return codeA.localeCompare(codeB, undefined, { numeric: true });
    });
    return sorted.filter((m) => memberMatchesQuery(m, search));
  }, [members, search]);

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
    if (!selectedMember) {
      setForm(emptyFeeForm());
      return;
    }
    setForm(memberToFeeForm(selectedMember, packages));
  }, [selectedId, selectedMember, packages]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setSuccess('');
  }

  function handleSelect(memberId) {
    setSelectedId(memberId);
    setError('');
    setSuccess('');
  }

  async function handleCollect(event) {
    event.preventDefault();
    if (!selectedMember) return;

    if (!form.startFrom) {
      setError('Start date is required.');
      return;
    }

    const collectApi = feesApi?.collectRenew ?? api?.update;
    if (!collectApi) {
      setError('Local database is only available in the desktop app.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = buildCollectFeePayload(selectedMember, form, selectedPackage, totalAmount);
      payload.paymentMethod = form.paymentMethod;

      if (feesApi?.collectRenew) {
        await feesApi.collectRenew(selectedId, payload);
      } else {
        await api.update(selectedId, payload);
      }

      setSuccess(`Collected ${formatRs(totalAmount)} for ${selectedMember.name}. Membership renewed.`);
      await loadMembers();
    } catch (err) {
      setError(err.message ?? 'Failed to collect fees');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="collect-fees">
      {error && (
        <p className="collect-fees__message collect-fees__message--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="collect-fees__message collect-fees__message--success" role="status">
          {success}
        </p>
      )}

      <div className="collect-fees__layout">
        <aside className="collect-fees__search card">
          <h2 className="collect-fees__panel-title">Search Member</h2>
          <input
            type="search"
            className="collect-fees__search-input"
            placeholder="Search by code, name, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="collect-fees__results" role="listbox" aria-label="Members">
            {loading && <li className="collect-fees__empty">Loading…</li>}
            {!loading && filtered.length === 0 && (
              <li className="collect-fees__empty">No members found.</li>
            )}
            {!loading &&
              filtered.map((member) => {
                const isActive = member.id === selectedId;
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`collect-fees__result${isActive ? ' is-selected' : ''}`}
                      onClick={() => handleSelect(member.id)}
                    >
                      <span className="collect-fees__result-title">{memberDisplayLabel(member)}</span>
                      <span className="collect-fees__result-meta">{member.phone || '—'}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </aside>

        <section className="collect-fees__form card">
          {!selectedMember ? (
            <p className="collect-fees__empty">Select a member from the list to collect fees.</p>
          ) : (
            <form onSubmit={handleCollect}>
              <h2 className="collect-fees__panel-title">Collect Fees &amp; Renew</h2>

              <div className="collect-fees__grid">
                <label>
                  Member
                  <input type="text" value={memberDisplayLabel(selectedMember)} readOnly aria-readonly />
                </label>
                <label>
                  Package
                  <input
                    type="text"
                    value={memberPackageLabel(selectedMember, packages)}
                    readOnly
                    aria-readonly
                  />
                </label>
                <label>
                  Package Price
                  <input type="text" value={String(packagePrice)} readOnly aria-readonly />
                </label>
                <label>
                  Discount
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.discount}
                    onChange={(e) => updateField('discount', e.target.value)}
                  />
                </label>
                <label>
                  Payment Method
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => updateField('paymentMethod', e.target.value)}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start From <span className="collect-fees__required">(required)</span>
                  <input
                    type="date"
                    value={form.startFrom}
                    onChange={(e) => updateField('startFrom', e.target.value)}
                    required
                  />
                </label>
              </div>

              <footer className="collect-fees__footer">
                <div className="collect-fees__total-box">
                  <span className="collect-fees__total-label">Total Amount</span>
                  <strong className="collect-fees__total-value">{formatRs(totalAmount)}</strong>
                </div>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Processing…' : 'Collect & Renew'}
                </button>
              </footer>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
