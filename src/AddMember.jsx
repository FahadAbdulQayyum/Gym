import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PACKAGES,
  GENDER_OPTIONS,
  PAYMENT_METHODS,
  activePackagesOnly,
  buildMemberPayload,
  formatRs,
  packageOptionLabel,
  parseAmount,
  todayInputValue,
} from './memberShared';
import { usePackages } from './usePackages';
import './AddMember.css';

function emptyForm() {
  return {
    fullName: '',
    phone: '',
    gender: '',
    registrationDate: todayInputValue(),
    address: '',
    packageId: DEFAULT_PACKAGES[0]?.id ?? '',
    packageStartDate: todayInputValue(),
    discount: '0',
    admissionFee: '',
    admissionPaymentMethod: 'Cash',
    trainerId: '',
    trainerFee: '',
    commissionPercent: '',
    commissionAmount: '',
  };
}

export default function AddMember() {
  const [form, setForm] = useState(emptyForm);
  const { packages: allPackages } = usePackages();
  const packages = activePackagesOnly(allPackages.length ? allPackages : DEFAULT_PACKAGES);
  const [trainers, setTrainers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const api = window.gymApp?.students;

  useEffect(() => {
    window.gymApp?.trainers?.list?.({ includeInactive: false }).then((list) => {
      if (list) setTrainers(list);
    });
  }, []);

  const selectedPackage = packages.find((p) => p.id === form.packageId) ?? packages[0];

  const totalAmount = useMemo(() => {
    const packagePrice = selectedPackage?.price ?? 0;
    const discount = parseAmount(form.discount);
    const admission = parseAmount(form.admissionFee);
    const trainer = parseAmount(form.trainerFee);
    return Math.max(0, packagePrice - discount + admission + trainer);
  }, [form.discount, form.admissionFee, form.trainerFee, selectedPackage]);

  useEffect(() => {
    const fee = parseAmount(form.trainerFee);
    const pct = parseAmount(form.commissionPercent);
    if (fee > 0 && pct >= 0) {
      const amount = Math.round((fee * pct) / 100);
      setForm((f) => {
        if (String(f.commissionAmount) === String(amount)) return f;
        return { ...f, commissionAmount: amount ? String(amount) : '' };
      });
    }
  }, [form.trainerFee, form.commissionPercent]);

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleCancel() {
    setForm(emptyForm());
    setError('');
    setSuccess('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!api?.create) {
      setError('Local database is only available in the desktop app.');
      return;
    }

    const name = form.fullName.trim();
    if (!name) {
      setError('Full name is required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const created = await api.create(
        buildMemberPayload(
          { ...form, fullName: name },
          selectedPackage,
          { includeFees: true, totalAmount }
        )
      );

      setSuccess(
        `Member saved. ${created.name} — Member ID ${created.memberCode}${
          parseAmount(form.admissionFee) > 0 ? '' : ' (no admission payment — fee was 0)'
        }.`
      );
      setForm(emptyForm());
    } catch (err) {
      setError(err.message ?? 'Failed to save member');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="add-member">
      {error && (
        <p className="add-member__message add-member__message--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="add-member__message add-member__message--success" role="status">
          {success}
        </p>
      )}

      <form className="add-member__form" onSubmit={handleSubmit}>
        <section className="add-member__section card">
          <h2 className="add-member__heading">Add Member</h2>
          <div className="add-member__grid">
            <label>
              Full Name *
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
            <label className="add-member__full">
              Address
              <textarea
                rows={3}
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="add-member__section card">
          <h2 className="add-member__heading">Package</h2>
          <div className="add-member__grid">
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
        </section>

        <section className="add-member__section card">
          <h2 className="add-member__heading">Admission</h2>
          <div className="add-member__grid">
            <label>
              Admission Fee (Rs)
              <input
                type="number"
                min={0}
                step={1}
                value={form.admissionFee}
                onChange={(e) => updateField('admissionFee', e.target.value)}
                placeholder="e.g., 1000"
              />
            </label>
            <label>
              Payment Method
              <select
                value={form.admissionPaymentMethod}
                onChange={(e) => updateField('admissionPaymentMethod', e.target.value)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="add-member__hint">
            Agar fee 0 chhor do, to admission payment create nahi hoga.
          </p>
        </section>

        <section className="add-member__section card">
          <h2 className="add-member__heading">Trainer</h2>
          <div className="add-member__grid add-member__grid--trainer">
            <label>
              Select Trainer
              <select
                value={form.trainerId}
                onChange={(e) => updateField('trainerId', e.target.value)}
              >
                <option value="">—</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trainer Fee
              <input
                type="number"
                min={0}
                step={1}
                value={form.trainerFee}
                onChange={(e) => updateField('trainerFee', e.target.value)}
              />
            </label>
            <label>
              Commission %
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.commissionPercent}
                onChange={(e) => updateField('commissionPercent', e.target.value)}
              />
            </label>
            <label>
              Commission Amount
              <input
                type="number"
                min={0}
                step={1}
                value={form.commissionAmount}
                onChange={(e) => updateField('commissionAmount', e.target.value)}
              />
            </label>
          </div>
        </section>

        <footer className="add-member__footer">
          <div className="add-member__total">
            <span className="add-member__total-label">Total Amount</span>
            <strong className="add-member__total-value">{formatRs(totalAmount)}</strong>
          </div>
          <div className="add-member__actions">
            <button
              type="button"
              className="add-member__btn-cancel"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Member'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
