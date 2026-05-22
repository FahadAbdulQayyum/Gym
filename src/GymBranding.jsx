import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_BRANDING,
  brandingDisplayName,
  brandingLogoLetter,
  normalizeBranding,
} from './brandingShared';
import './ModulePage.css';
import './GymBranding.css';

function emptyForm() {
  return { ...DEFAULT_BRANDING };
}

export default function GymBranding() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const api = window.gymApp?.branding;

  const load = useCallback(async () => {
    if (!api?.get) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.get();
      setForm(normalizeBranding(data));
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to load branding');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleClear() {
    setForm(emptyForm());
    setMessage('');
    setMessageType('');
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!api?.save) {
      setMessageType('error');
      setMessage('Local database is only available in the desktop app.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await api.save(form);
      setMessageType('success');
      setMessage('Branding saved.');
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Failed to save branding');
    } finally {
      setSaving(false);
    }
  }

  const previewName = brandingDisplayName(form);
  const previewLetter = brandingLogoLetter(form);

  return (
    <section className="gym-branding module-page">
      <div className="gym-branding__layout">
        <form className="gym-branding__form card module-card" onSubmit={handleSave}>
          <h2 className="module-card__title">Gym Branding</h2>

          {message && (
            <p
              className={`module-page__message module-page__message--${messageType === 'success' ? 'success' : 'error'}`}
              role="alert"
            >
              {message}
            </p>
          )}

          <label className="gym-branding__field">
            <span>Gym Name</span>
            <input
              className="module-input"
              value={form.gymName}
              onChange={(e) => updateField('gymName', e.target.value)}
              placeholder="Zyntra Gym"
              disabled={loading || saving}
            />
          </label>

          <label className="gym-branding__field">
            <span>Phone</span>
            <input
              className="module-input"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="+92-300-..."
              disabled={loading || saving}
            />
          </label>

          <label className="gym-branding__field">
            <span>Email</span>
            <input
              className="module-input"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="info@yourgym.com"
              disabled={loading || saving}
            />
          </label>

          <label className="gym-branding__field">
            <span>Address</span>
            <input
              className="module-input"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="Street, City"
              disabled={loading || saving}
            />
          </label>

          <label className="gym-branding__field">
            <span>Logo URL</span>
            <input
              className="module-input"
              value={form.logoUrl}
              onChange={(e) => updateField('logoUrl', e.target.value)}
              placeholder="https://..."
              disabled={loading || saving}
            />
          </label>

          <label className="gym-branding__field">
            <span>Footer Note</span>
            <textarea
              className="module-input gym-branding__textarea"
              rows={4}
              value={form.footerNote}
              onChange={(e) => updateField('footerNote', e.target.value)}
              disabled={loading || saving}
            />
          </label>

          <div className="gym-branding__actions">
            <button type="button" className="btn-secondary" onClick={handleClear} disabled={saving}>
              Clear
            </button>
            <button type="submit" className="btn-primary" disabled={loading || saving}>
              {saving ? 'Saving…' : 'Save Branding'}
            </button>
          </div>
        </form>

        <aside className="gym-branding__preview card module-card">
          <h3 className="module-card__title">Receipt Preview</h3>
          <div className="gym-branding__receipt">
            <div className="gym-branding__receipt-head">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="" className="gym-branding__receipt-logo-img" />
              ) : (
                <span className="gym-branding__receipt-logo">{previewLetter}</span>
              )}
              <strong>{previewName}</strong>
            </div>
            <hr className="gym-branding__receipt-rule" />
            <p className="gym-branding__receipt-footer">
              {form.footerNote || DEFAULT_BRANDING.footerNote}
            </p>
          </div>
          <p className="gym-branding__note">
            Note: Yehi branding &quot;Collect Fees&quot; ki slip par print hogi.
          </p>
        </aside>
      </div>
    </section>
  );
}
