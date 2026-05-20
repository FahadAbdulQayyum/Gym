import { useCallback, useEffect, useState } from 'react';
import {
  enrollFingerprint,
  isFingerprintAvailable,
  verifyAnyEnrolledFingerprint,
  verifyFingerprint,
} from './fingerprint';
import { playOops } from './sounds';
import './StudentsDashboard.css';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatCheckInMethod(method) {
  switch (method) {
    case 'fingerprint':
      return 'Fingerprint';
    case 'pin':
      return 'PIN';
    case 'memberId':
      return 'Member ID';
    default:
      return 'Manual';
  }
}

const emptyForm = () => ({
  name: '',
  age: '',
  entryDate: todayInputValue(),
  pin: '',
});

export default function StudentsDashboard() {
  const [students, setStudents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fingerprintReady, setFingerprintReady] = useState(false);
  const [enrollFingerprintOnSave, setEnrollFingerprintOnSave] = useState(false);
  const [setPinOnSave, setSetPinOnSave] = useState(true);
  const [quickMemberCode, setQuickMemberCode] = useState('');
  const [quickPin, setQuickPin] = useState('');
  const [pinEdit, setPinEdit] = useState('');

  const api = window.gymApp?.students;

  useEffect(() => {
    isFingerprintAvailable().then(setFingerprintReady);
  }, []);

  const loadStudents = useCallback(async () => {
    if (!api?.list) {
      setLoading(false);
      setError('Local database is only available in the desktop app.');
      return;
    }

    try {
      setError('');
      const list = await api.list();
      setStudents(list);
      setSelectedId((current) => {
        if (current && list.some((s) => s.id === current)) return current;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err.message ?? 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (!window.gymApp?.onSyncStatus) return undefined;
    return window.gymApp.onSyncStatus((status) => {
      if (status?.merged || status?.status === 'synced') {
        loadStudents();
      }
    });
  }, [loadStudents]);

  const selected = students.find((s) => s.id === selectedId) ?? null;

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setEnrollFingerprintOnSave(false);
    setSetPinOnSave(true);
  }

  function startEdit(student) {
    setEditingId(student.id);
    setSelectedId(student.id);
    setForm({
      name: student.name,
      age: String(student.age),
      entryDate: student.entryDate,
      pin: '',
    });
    setEnrollFingerprintOnSave(!student.fingerprint?.credentialId);
    setSetPinOnSave(false);
    setPinEdit('');
  }

  async function enrollStudentFingerprint(student) {
    // Only exclude this member's old credential (re-enroll). Do not pass other members'
    // credentials — that can make Windows refuse a second passkey for the gym app.
    const excludeCredentialIds = student.fingerprint?.credentialId
      ? [student.fingerprint.credentialId]
      : [];
    const { credentialId, userHandle } = await enrollFingerprint(student, {
      excludeCredentialIds,
    });
    await api.registerFingerprint(student.id, credentialId, userHandle);
    return credentialId;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!api) return;

    setSaving(true);
    clearMessages();

    try {
      const payload = {
        name: form.name,
        age: form.age,
        entryDate: form.entryDate,
      };

      if (editingId) {
        const updated = await api.update(editingId, payload);
        setSelectedId(updated.id);

        if (
          enrollFingerprintOnSave &&
          fingerprintReady &&
          !updated.fingerprint?.credentialId
        ) {
          await enrollStudentFingerprint(updated);
          setSuccess(`Updated ${updated.name} and enrolled fingerprint for attendance.`);
        } else {
          setSuccess(`Updated ${updated.name}. Member ID: ${updated.memberCode}.`);
        }
      } else {
        const created = await api.create(payload);
        setSelectedId(created.id);

        if (setPinOnSave && form.pin.trim()) {
          await api.setPin(created.id, form.pin.trim());
        }

        if (enrollFingerprintOnSave && fingerprintReady) {
          await enrollStudentFingerprint(created);
          setSuccess(
            `Registered ${created.name}. Member ID: ${created.memberCode}. Fingerprint enrolled.`
          );
        } else {
          const pinNote =
            setPinOnSave && form.pin.trim()
              ? ' They can check in with their PIN or Member ID.'
              : ' Set a PIN in the attendance panel for quick check-in.';
          setSuccess(`Registered ${created.name}. Member ID: ${created.memberCode}.${pinNote}`);
        }
      }

      resetForm();
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to save student');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(student) {
    if (!api) return;
    const confirmed = window.confirm(`Remove ${student.name} and all attendance records?`);
    if (!confirmed) return;

    setError('');
    try {
      await api.delete(student.id);
      if (editingId === student.id) resetForm();
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to delete student');
    }
  }

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  async function handleCheckIn(method = 'manual') {
    if (!api || !selected) return;

    setSaving(true);
    clearMessages();
    try {
      await api.checkIn(selected.id, method);
      setSuccess(
        method === 'fingerprint'
          ? `${selected.name} checked in with fingerprint.`
          : `${selected.name} checked in.`
      );
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to record attendance');
    } finally {
      setSaving(false);
    }
  }

  async function handleEnrollFingerprint() {
    if (!api || !selected) return;
    if (!fingerprintReady) {
      setError('Fingerprint reader is not available. Set up Windows Hello on this PC.');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      await enrollStudentFingerprint(selected);
      setSuccess(`Fingerprint enrolled for ${selected.name}.`);
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to enroll fingerprint');
    } finally {
      setSaving(false);
    }
  }

  const editingStudent = editingId ? students.find((s) => s.id === editingId) : null;
  const showFingerprintOnSave =
    !editingId || !editingStudent?.fingerprint?.credentialId;

  async function handleClearFingerprint() {
    if (!api || !selected) return;
    const confirmed = window.confirm(`Remove fingerprint enrollment for ${selected.name}?`);
    if (!confirmed) return;

    clearMessages();
    try {
      await api.clearFingerprint(selected.id);
      setSuccess(`Fingerprint removed for ${selected.name}.`);
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to remove fingerprint');
    }
  }

  async function handleFingerprintCheckInForSelected() {
    if (!api || !selected?.fingerprint?.credentialId) return;

    setSaving(true);
    clearMessages();
    try {
      const verifiedId = await verifyFingerprint(selected.fingerprint.credentialId);
      if (verifiedId !== selected.fingerprint.credentialId) {
        throw new Error('Fingerprint does not match this student');
      }
      await api.checkIn(selected.id, 'fingerprint');
      setSuccess(`${selected.name} checked in with fingerprint.`);
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Fingerprint check-in failed');
      playOops();
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickFingerprintCheckIn() {
    if (!api) return;
    if (!fingerprintReady) {
      setError('Fingerprint reader is not available. Set up Windows Hello on this PC.');
      return;
    }

    const enrolled = students.filter((s) => s.fingerprint?.credentialId);
    if (enrolled.length === 0) {
      setError('No students have enrolled fingerprints yet.');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      const credentialIds = enrolled.map((s) => s.fingerprint.credentialId);
      const verifiedId = await verifyAnyEnrolledFingerprint(credentialIds);
      const result = await api.checkInByFingerprint(verifiedId);
      setSuccess(`${result.student.name} checked in with fingerprint.`);
      setSelectedId(result.student.id);
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Fingerprint check-in failed');
      playOops();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAttendance(attendanceId) {
    if (!api || !selected) return;

    setError('');
    try {
      await api.deleteAttendance(selected.id, attendanceId);
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to remove attendance');
    }
  }

  async function handleQuickCheckIn(event) {
    event.preventDefault();
    if (!api) return;

    const pin = quickPin.trim();
    const memberCode = quickMemberCode.trim();

    if (!pin && !memberCode) {
      setError('Enter a Member ID or PIN to check in.');
      return;
    }

    setSaving(true);
    clearMessages();
    try {
      const result = pin
        ? await api.checkInByPin(pin)
        : await api.checkInByMemberCode(memberCode);
      setSuccess(`${result.student.name} checked in.`);
      setSelectedId(result.student.id);
      setQuickPin('');
      setQuickMemberCode('');
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Check-in failed');
      playOops();
    } finally {
      setSaving(false);
    }
  }

  async function handleSetPin(event) {
    event.preventDefault();
    if (!api || !selected) return;

    setSaving(true);
    clearMessages();
    try {
      await api.setPin(selected.id, pinEdit.trim());
      setPinEdit('');
      setSuccess(`PIN updated for ${selected.name}.`);
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to set PIN');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearPin() {
    if (!api || !selected) return;
    const confirmed = window.confirm(`Remove PIN for ${selected.name}?`);
    if (!confirmed) return;

    clearMessages();
    try {
      await api.clearPin(selected.id);
      setSuccess(`PIN removed for ${selected.name}.`);
      await loadStudents();
    } catch (err) {
      setError(err.message ?? 'Failed to remove PIN');
    }
  }

  return (
    <div className="students-dashboard">
      {error && (
        <div className="students-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="students-success" role="status">
          {success}
        </div>
      )}

      <section className="card quick-checkin-card">
        <div className="card-header">
          <h2>Quick check-in</h2>
          <span className="quick-checkin-badge">Recommended</span>
        </div>
        <p className="quick-checkin-card__hint">
          Each member gets a unique 6-digit Member ID. They can also use a personal PIN (4–6 digits).
          No extra hardware required.
        </p>
        <form className="quick-checkin-form" onSubmit={handleQuickCheckIn}>
          <label>
            Member ID
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="e.g. 482913"
              value={quickMemberCode}
              onChange={(e) => setQuickMemberCode(e.target.value.replace(/\D/g, ''))}
              disabled={saving || !api}
            />
          </label>
          <span className="quick-checkin-form__or">or</span>
          <label>
            PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="4–6 digits"
              value={quickPin}
              onChange={(e) => setQuickPin(e.target.value.replace(/\D/g, ''))}
              disabled={saving || !api}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={saving || !api}>
            Check in
          </button>
        </form>
        <p className="quick-checkin-card__tip">
          Tip: a cheap USB barcode scanner can type the Member ID and press Enter — works like a keyboard.
        </p>
      </section>

      <section className="card fingerprint-quick-card fingerprint-quick-card--optional">
        <div className="card-header">
          <h2>Fingerprint check-in</h2>
          <span className={`fingerprint-status ${fingerprintReady ? 'is-ready' : ''}`}>
            {fingerprintReady ? 'Windows Hello ready' : 'Optional'}
          </span>
        </div>
        <p className="fingerprint-quick-card__hint">
          Optional — uses Windows Hello on this PC only (see note below).
        </p>
        <div className="fingerprint-notice" role="note">
          <strong>Enroll a different finger per member</strong>
          <ol className="fingerprint-notice__steps">
            <li>
              <strong>Windows first:</strong> Settings → Accounts → Sign-in options → Fingerprint → add
              that person&apos;s finger (right for member 1, left for member 2, etc.).
            </li>
            <li>
              <strong>Member 1:</strong> Register → Attendance → Enroll fingerprint → scan{' '}
              <em>right hand only</em>.
            </li>
            <li>
              <strong>Member 2:</strong> Register as a <em>new</em> student (not edit member 1) → Enroll
              fingerprint → scan <em>left hand only</em>.
            </li>
            <li>Check-in: quick fingerprint scan; Windows matches the finger to the right member.</li>
          </ol>
          <p>
            Do not enroll two members with the same finger. If you see an error, remove that member&apos;s
            fingerprint in Attendance and enroll again with the correct hand.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary btn-fingerprint"
          onClick={handleQuickFingerprintCheckIn}
          disabled={saving || !api || !fingerprintReady}
        >
          Scan fingerprint to check in
        </button>
      </section>

      <div className="students-layout">
        <section className="card students-form-card">
          <div className="card-header">
            <h2>{editingId ? 'Edit student' : 'Register student'}</h2>
            {editingId && (
              <button type="button" className="btn-ghost" onClick={resetForm}>
                Cancel edit
              </button>
            )}
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <label>
              Full name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Ali Khan"
                required
              />
            </label>
            <div className="form-row">
              <label>
                Age
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.age}
                  onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                  placeholder="25"
                  required
                />
              </label>
              <label>
                Entry date
                <input
                  type="date"
                  value={form.entryDate}
                  onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
                  required
                />
              </label>
            </div>

            {!editingId && (
              <>
                <label>
                  Check-in PIN (optional)
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    placeholder="4–6 digits"
                    value={form.pin}
                    onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                    disabled={saving || !setPinOnSave}
                  />
                </label>
                <label className="fingerprint-opt-in">
                  <input
                    type="checkbox"
                    checked={setPinOnSave}
                    onChange={(e) => setSetPinOnSave(e.target.checked)}
                    disabled={saving}
                  />
                  <span>
                    <strong>Save PIN for quick check-in</strong>
                    <small>Members can enter their PIN at the door instead of selecting their name.</small>
                  </span>
                </label>
              </>
            )}

            {showFingerprintOnSave && (
              <label className="fingerprint-opt-in">
                <input
                  type="checkbox"
                  checked={enrollFingerprintOnSave}
                  onChange={(e) => setEnrollFingerprintOnSave(e.target.checked)}
                  disabled={!fingerprintReady || saving}
                />
                <span>
                  <strong>Also enroll Windows Hello fingerprint</strong>
                  <small>Optional — only works for fingers registered in Windows Settings on this PC.</small>
                </span>
              </label>
            )}

            <button type="submit" className="btn-primary" disabled={saving || !api}>
              {saving
                ? enrollFingerprintOnSave && fingerprintReady && showFingerprintOnSave
                  ? 'Saving & scanning fingerprint…'
                  : 'Saving…'
                : editingId
                  ? enrollFingerprintOnSave && showFingerprintOnSave && fingerprintReady
                    ? 'Update & enroll fingerprint'
                    : 'Update student'
                  : enrollFingerprintOnSave && fingerprintReady
                    ? 'Register & enroll fingerprint'
                    : 'Register student'}
            </button>
          </form>
        </section>

        <section className="card students-list-card">
          <div className="card-header">
            <h2>Students</h2>
            <span className="card-count">
              {students.length} {students.length === 1 ? 'member' : 'members'}
            </span>
          </div>

          {loading ? (
            <p className="empty">Loading from local database…</p>
          ) : students.length === 0 ? (
            <p className="empty">No students yet. Register the first member above.</p>
          ) : (
            <ul className="students-list">
              {students.map((student) => (
                <li
                  key={student.id}
                  className={student.id === selectedId ? 'is-selected' : ''}
                >
                  <button
                    type="button"
                    className="students-list__select"
                    onClick={() => setSelectedId(student.id)}
                  >
                    <strong>{student.name}</strong>
                    <span>
                      Age {student.age} · Joined {formatDate(student.entryDate)}
                    </span>
                    <span className="students-list__meta">
                      ID {student.memberCode}
                      {student.hasPin ? ' · PIN set' : ''}
                      {' · '}
                      {student.attendance.length} check-in
                      {student.attendance.length === 1 ? '' : 's'}
                    </span>
                  </button>
                  <div className="students-list__actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => startEdit(student)}
                      aria-label={`Edit ${student.name}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => handleDelete(student)}
                      aria-label={`Delete ${student.name}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card students-detail-card">
          <div className="card-header card-header--wrap">
            <h2>Attendance</h2>
            {selected && (
              <div className="attendance-actions">
                <button
                  type="button"
                  className="btn-primary btn-primary--compact"
                  onClick={() => handleCheckIn('manual')}
                  disabled={saving || !api}
                >
                  Manual check-in
                </button>
                {selected.fingerprint?.credentialId ? (
                  <button
                    type="button"
                    className="btn-primary btn-primary--compact btn-fingerprint"
                    onClick={handleFingerprintCheckInForSelected}
                    disabled={saving || !api || !fingerprintReady}
                  >
                    Fingerprint check-in
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {!selected ? (
            <p className="empty">Select a student to view attendance history.</p>
          ) : (
            <>
              <div className="student-profile">
                <h3>{selected.name}</h3>
                <p>
                  Member ID <strong className="member-code">{selected.memberCode}</strong> · Age{' '}
                  <strong>{selected.age}</strong> · Entry{' '}
                  <strong>{formatDate(selected.entryDate)}</strong>
                </p>
                <p className="student-profile__timestamps">
                  Created {formatTimestamp(selected.createdAt)}
                  {selected.updatedAt !== selected.createdAt && (
                    <> · Updated {formatTimestamp(selected.updatedAt)}</>
                  )}
                </p>
              </div>

              <div className="member-pin-panel">
                <div>
                  <strong>Check-in PIN</strong>
                  <p>
                    {selected.hasPin
                      ? 'PIN is set. Member can use it at quick check-in.'
                      : 'No PIN yet — set one for faster check-in at the door.'}
                  </p>
                </div>
                <form className="member-pin-form" onSubmit={handleSetPin}>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    placeholder="New PIN (4–6 digits)"
                    value={pinEdit}
                    onChange={(e) => setPinEdit(e.target.value.replace(/\D/g, ''))}
                    disabled={saving || !api}
                  />
                  <button type="submit" className="btn-primary btn-primary--compact" disabled={saving || !api}>
                    {selected.hasPin ? 'Update PIN' : 'Set PIN'}
                  </button>
                  {selected.hasPin ? (
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={handleClearPin}
                      disabled={saving || !api}
                    >
                      Remove
                    </button>
                  ) : null}
                </form>
              </div>

              <div className="fingerprint-enroll">
                <div>
                  <strong>Fingerprint (optional)</strong>
                  <p>
                    {selected.fingerprint?.credentialId
                      ? `Enrolled ${formatTimestamp(selected.fingerprint.enrolledAt)}`
                      : 'Not enrolled — link this member to Windows Hello.'}
                  </p>
                </div>
                <div className="fingerprint-enroll__actions">
                  {selected.fingerprint?.credentialId ? (
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={handleClearFingerprint}
                      disabled={saving || !api}
                    >
                      Remove fingerprint
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary btn-primary--compact btn-fingerprint"
                      onClick={handleEnrollFingerprint}
                      disabled={saving || !api || !fingerprintReady}
                    >
                      Enroll fingerprint
                    </button>
                  )}
                </div>
              </div>

              {selected.attendance.length === 0 ? (
                <p className="empty">No check-ins yet. Use manual or fingerprint check-in.</p>
              ) : (
                <ul className="attendance-list">
                  {selected.attendance.map((record, index) => (
                    <li key={record.id}>
                      <div className="attendance-list__index">#{selected.attendance.length - index}</div>
                      <div className="attendance-list__body">
                        <strong>{formatTimestamp(record.checkedInAt)}</strong>
                        <span className="attendance-method">
                          {formatCheckInMethod(record.method)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="remove"
                        onClick={() => handleDeleteAttendance(record.id)}
                        aria-label="Remove attendance record"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
