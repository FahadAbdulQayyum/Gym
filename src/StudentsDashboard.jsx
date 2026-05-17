import { useCallback, useEffect, useState } from 'react';
import {
  enrollFingerprint,
  isFingerprintAvailable,
  verifyAnyEnrolledFingerprint,
  verifyFingerprint,
} from './fingerprint';
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

const emptyForm = () => ({
  name: '',
  age: '',
  entryDate: todayInputValue(),
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
  const [enrollFingerprintOnSave, setEnrollFingerprintOnSave] = useState(true);

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

  const selected = students.find((s) => s.id === selectedId) ?? null;

  function resetForm() {
    setForm(emptyForm());
    setEditingId(null);
    setEnrollFingerprintOnSave(true);
  }

  function startEdit(student) {
    setEditingId(student.id);
    setSelectedId(student.id);
    setForm({
      name: student.name,
      age: String(student.age),
      entryDate: student.entryDate,
    });
    setEnrollFingerprintOnSave(!student.fingerprint?.credentialId);
  }

  async function enrollStudentFingerprint(student) {
    const credentialId = await enrollFingerprint(student);
    await api.registerFingerprint(student.id, credentialId);
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
          setSuccess(`Updated ${updated.name}.`);
        }
      } else {
        const created = await api.create(payload);
        setSelectedId(created.id);

        if (enrollFingerprintOnSave && fingerprintReady) {
          await enrollStudentFingerprint(created);
          setSuccess(
            `Registered ${created.name}. Fingerprint saved — they can check in by scanning at the door.`
          );
        } else if (enrollFingerprintOnSave && !fingerprintReady) {
          setSuccess(
            `Registered ${created.name}. Enable Windows Hello on this PC, then enroll their fingerprint from the attendance panel.`
          );
        } else {
          setSuccess(
            `Registered ${created.name}. Enroll their fingerprint later for scan-to-check-in.`
          );
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

      <section className="card fingerprint-quick-card">
        <div className="card-header">
          <h2>Fingerprint check-in</h2>
          <span className={`fingerprint-status ${fingerprintReady ? 'is-ready' : ''}`}>
            {fingerprintReady ? 'Windows Hello ready' : 'Not available'}
          </span>
        </div>
        <p className="fingerprint-quick-card__hint">
          Scan an enrolled fingerprint to check in instantly — no need to select a student first.
        </p>
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

            {showFingerprintOnSave && (
              <label className="fingerprint-opt-in">
                <input
                  type="checkbox"
                  checked={enrollFingerprintOnSave}
                  onChange={(e) => setEnrollFingerprintOnSave(e.target.checked)}
                  disabled={!fingerprintReady || saving}
                />
                <span>
                  <strong>Enroll fingerprint now</strong>
                  <small>
                    {fingerprintReady
                      ? 'Needed for scan-to-check-in. Windows Hello will prompt right after you save.'
                      : 'Set up Windows Hello fingerprint on this PC to enable.'}
                  </small>
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
                      {student.attendance.length} check-in
                      {student.attendance.length === 1 ? '' : 's'}
                      {student.fingerprint?.credentialId ? ' · fingerprint enrolled' : ''}
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
                  Age <strong>{selected.age}</strong> · Entry{' '}
                  <strong>{formatDate(selected.entryDate)}</strong>
                </p>
                <p className="student-profile__timestamps">
                  Created {formatTimestamp(selected.createdAt)}
                  {selected.updatedAt !== selected.createdAt && (
                    <> · Updated {formatTimestamp(selected.updatedAt)}</>
                  )}
                </p>
              </div>

              <div className="fingerprint-enroll">
                <div>
                  <strong>Fingerprint</strong>
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
                          {record.method === 'fingerprint' ? 'Fingerprint' : 'Manual'}
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
